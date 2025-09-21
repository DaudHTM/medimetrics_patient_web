import React, { useRef, useState, useEffect } from 'react';
import './Scan.css';
import { useAuth } from '../contexts/AuthContext';
import { storage, db } from '../firebase';
import { ref as storageRef, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function Scan() {
	const [mode, setMode] = useState('hand');
	const [imageSrc, setImageSrc] = useState(null);
		const [loading, setLoading] = useState(false);
		const [scanResult, setScanResult] = useState(null);
			const [measurements, setMeasurements] = useState(null);
			const [scaleMmPerPx, setScaleMmPerPx] = useState(null);
			const [annotatedImageDataUrl, setAnnotatedImageDataUrl] = useState(null);
		const [scanTimestamp, setScanTimestamp] = useState(null);
	const [cameraActive, setCameraActive] = useState(false);
	const [error, setError] = useState(null);
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
	const streamRef = useRef(null);
	const fileInputRef = useRef(null);
	const { user } = useAuth();
	const [uploadingResults, setUploadingResults] = useState(false);
	const [uploadError, setUploadError] = useState(null);
	const [uploadSuccessDocId, setUploadSuccessDocId] = useState(null);

	useEffect(() => {
		return () => {
			stopCamera();
			if (imageSrc && imageSrc.startsWith('blob:')) {
				URL.revokeObjectURL(imageSrc);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleModeChange = (e) => setMode(e.target.value);

	// Helper to make measurement keys human-friendly
	const prettifyKey = (k) => {
		if (!k) return '';
		return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	};

	const handleUploadClick = () => {
		if (fileInputRef.current) fileInputRef.current.click();
	};

	const handleFileChange = (e) => {
		const file = e.target.files && e.target.files[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			setError('Please select an image file');
			return;
		}
		setError(null);
		if (imageSrc && imageSrc.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
		const url = URL.createObjectURL(file);
		setImageSrc(url);
	};

	const startCamera = async () => {
		setError(null);
		try {
			const s = await navigator.mediaDevices.getUserMedia({ video: true });
			streamRef.current = s;
			if (videoRef.current) {
				videoRef.current.srcObject = s;
				videoRef.current.play();
			}
			setCameraActive(true);
		} catch (err) {
			setError('Unable to access camera: ' + (err.message || err.name));
		}
	};

	const stopCamera = () => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
		}
		if (videoRef.current) {
			videoRef.current.pause();
			videoRef.current.srcObject = null;
		}
		setCameraActive(false);
	};

	const handleTakeImageClick = () => {
		if (cameraActive) {
			// if already active, stop it
			stopCamera();
		} else {
			startCamera();
		}
	};

	const handleCapture = () => {
		if (!videoRef.current) return;
		const video = videoRef.current;
		const canvas = canvasRef.current || document.createElement('canvas');
		canvas.width = video.videoWidth || 640;
		canvas.height = video.videoHeight || 480;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		const dataUrl = canvas.toDataURL('image/png');
		if (imageSrc && imageSrc.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
		setImageSrc(dataUrl);
		stopCamera();
	};

		const handleStartScan = async () => {
			if (!imageSrc) {
				setError('Please upload or capture an image before starting a scan.');
				return;
			}
			setError(null);
			setScanResult(null);
			setLoading(true);

			// Use environment variable API_BASE if provided, otherwise fall back to localhost
			const API_BASE =  process.env.REACT_APP_API_BASE;
			const endpoint = `${API_BASE.replace(/\/$/, '')}/measure-${mode}`;

			
			try {
				// Convert the imageSrc (data: or blob:) into a Blob
				const responseForBlob = await fetch(imageSrc);
				const blob = await responseForBlob.blob();

				const form = new FormData();
				// Use a reasonable filename
				const filename = `${mode}-scan.png`;
				form.append('file', blob, filename);

				const resp = await fetch(endpoint, {
					method: 'POST',
					body: form,
				});

				if (!resp.ok) {
					const text = await resp.text();
					throw new Error(`Server responded ${resp.status}: ${text}`);
				}

				// Try to parse JSON, fall back to text
						let body;
						const contentType = resp.headers.get('content-type') || '';
						if (contentType.includes('application/json')) {
							body = await resp.json();
						} else {
							// try to parse as json anyway
							const text = await resp.text();
							try {
								body = JSON.parse(text);
							} catch (e) {
								body = text;
							}
						}
						setScanResult(body);

						// If body is an object and contains expected fields, store them
						if (body && typeof body === 'object') {
							if (body.measurements) setMeasurements(body.measurements);
							if (body.scale_mm_per_px) setScaleMmPerPx(body.scale_mm_per_px);
							if (body.annotated_image_b64) {
								// annotated_image_b64 may include data URI prefix or just base64
								let b64 = body.annotated_image_b64;
								// Trim whitespace/newlines
								b64 = b64.trim();
								// If it already starts with data:, use directly
								let dataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
								setAnnotatedImageDataUrl(dataUrl);
							}
							// set timestamp when response received
							setScanTimestamp(new Date());
						}
						
			} catch (err) {
				console.error('Scan failed', err);
				setError('Scan failed: ' + (err.message || err));
			} finally {
				setLoading(false);
			}
		};

	// ...existing code...

	const handleUploadResults = async () => {
		setUploadError(null);
		setUploadSuccessDocId(null);
		if (!user) {
			setUploadError('You must be signed in to upload results.');
			return;
		}
		if (!annotatedImageDataUrl) {
			setUploadError('No annotated image to upload.');
			return;
		}
		setUploadingResults(true);
		try {
			// Upload annotated image to Firebase Storage as a base64 string
			const ts = Date.now();
			const path = `users/${user.uid}/annotated-${ts}.png`;
			// annotatedImageDataUrl is a data URL
			await uploadString(storageRef(storage, path), annotatedImageDataUrl, 'data_url');
			const fileUrl = await getDownloadURL(storageRef(storage, path));

			// Upload original image to Storage and get URL
			let originalUrl = null;
			if (imageSrc) {
				const origPath = `users/${user.uid}/original-${ts}.png`;
				if (imageSrc.startsWith('data:')) {
					await uploadString(storageRef(storage, origPath), imageSrc, 'data_url');
				} else {
					const r = await fetch(imageSrc);
					const b = await r.blob();
					await uploadBytes(storageRef(storage, origPath), b);
				}
				originalUrl = await getDownloadURL(storageRef(storage, origPath));
			}

			// Create Firestore document under users/{uid}/scans
			const scansCol = collection(db, 'users', user.uid, 'scans');
			const doc = await addDoc(scansCol, {
				timestamp: serverTimestamp(),
				uid: user.uid,
				scanType: mode,
				annotatedImageUrl: fileUrl,
				originalImageUrl: originalUrl,
				measurements: measurements || null,
				scale_mm_per_px: scaleMmPerPx || null,
			});
			setUploadSuccessDocId(doc.id);
		} catch (err) {
			console.error('Upload results failed', err);
			setUploadError(err.message || String(err));
		} finally {
			setUploadingResults(false);
		}
	};

	return (
		<div className="scan-container">
			<h2>Scan</h2>

			<div className="field">
				<label htmlFor="mode-select">Select target:</label>
				<select id="mode-select" value={mode} onChange={handleModeChange}>
					<option value="hand">Hand</option>
					<option value="face">Face</option>
				</select>
			</div>

			<div className="buttons">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					style={{ display: 'none' }}
					onChange={handleFileChange}
				/>
				<button className="btn btn-ghost" onClick={handleUploadClick}>Upload Image</button>
				<button className="btn btn-primary" onClick={handleTakeImageClick}>{cameraActive ? 'Stop Camera' : 'Take Image'}</button>
				<button className="btn btn-primary" onClick={handleStartScan}>Start Scan</button>
			</div>

			{error && <div className="error">{error}</div>}

			{cameraActive && (
				<div className="camera">
					<video ref={videoRef} playsInline muted className="video-preview" />
					<div>
						<button className="btn btn-primary" onClick={handleCapture}>Capture Photo</button>
						<button className="btn btn-ghost" onClick={stopCamera}>Cancel</button>
					</div>
				</div>
			)}

			{imageSrc && (
				<div className="preview">
					<h3>Preview</h3>
					<img src={imageSrc} alt="preview" />
				</div>
			)}

					{loading && <div className="loading">Uploading image and running scan...</div>}

					{measurements && (
								<div className="scan-result">
									<h3>Scan result</h3>
									<div className="measure-grid">
										{measurements && Object.entries(measurements).map(([k, v]) => (
											<div className="measure-card" key={k}>
												<div style={{display:'flex',alignItems:'center',width:'100%'}}>
													<div>
														<div className="measure-name">{prettifyKey(k)}</div>
														<div style={{display:'flex',alignItems:'baseline',gap:6}}>
															<div className="measure-value">{Number(v).toFixed(1)}</div>
															<div className="measure-unit">mm</div>
														</div>
													</div>
													<div className="measure-icon" aria-hidden>🔍</div>
												</div>
											</div>
										))}
									</div>
								</div>
					)}

							{annotatedImageDataUrl && (
								<div className="annotated-preview">
									<h3>Annotated image</h3>
									<img src={annotatedImageDataUrl} alt="annotated" />
									{scanTimestamp && (
										<div className="scan-timestamp">Scanned: {scanTimestamp.toLocaleString()}</div>
									)}
								</div>
							)}

							{scaleMmPerPx && <div className="scale">Scale: {scaleMmPerPx} mm/px</div>}

							<div className="upload-results">
								<button className="btn btn-primary" onClick={handleUploadResults} disabled={uploadingResults || !annotatedImageDataUrl}>
									{uploadingResults ? 'Uploading...' : 'Upload Results'}
								</button>
								{uploadError && <div className="error">{uploadError}</div>}
								{uploadSuccessDocId && (
									<div className="success">Uploaded. Doc ID: {uploadSuccessDocId}</div>
								)}
							</div>

			<canvas ref={canvasRef} style={{ display: 'none' }} />
		</div>
	);
}

