import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { runOCR, mergeOCRTexts } from '../utils/ocrService';
import { extractCardData } from '../utils/extractCardData';
import { saveContactToDB } from '../storage/db';
import { enqueueAction } from '../queue/offlineQueue';

export default function ScanScreen({ onCardScanned }) {

  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [sourceLabel, setSourceLabel] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);

  const addToast = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setVideoReady(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const openCamera = async () => {
    try {
      setPreviewUrl(null);
      setVideoReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      console.log("camera opened");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (error) {
      console.error('[Camera] Access error:', error);
      if (error.name === 'NotAllowedError') {
        addToast('Camera permission denied. Please allow camera access in your browser settings.', 'error');
      } else if (error.name === 'NotFoundError') {
        addToast('No camera found on this device.', 'error');
      } else if (error.name === 'NotReadableError') {
        addToast('Camera is in use by another application.', 'error');
      } else if (error.name === 'OverconstrainedError') {
        addToast('Camera constraints could not be satisfied by this device.', 'error');
      } else {
        addToast('Camera access denied.', 'error');
      }
    }
  };

  const handleVideoCanPlay = () => {
    const video = videoRef.current;
    if (video) {
      console.log("metadata loaded");
      console.log("Video Resolution:", video.videoWidth, video.videoHeight);
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoReady(true);
      } else {
        setVideoReady(false);
      }
    }
  };

  const captureSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    console.log("capture triggered");

    // Capture at full device resolution
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) {
      addToast('Camera not ready yet. Please wait a moment and try again.', 'warning');
      return;
    }

    canvas.width = vw;
    canvas.height = vh;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      console.log("blob created");
      if (!blob || blob.size === 0) {
        console.error('[Camera] toBlob produced null or empty blob');
        addToast('Unable to process captured image. Please retake the photo or improve lighting.', 'error');
        return;
      }

      // Generate a standardized jpeg file
      const file = new File(
        [blob],
        `business-card-${Date.now()}.jpg`,
        {
          type: "image/jpeg"
        }
      );

      console.log("Captured File:", file);
      console.log("File Size:", file.size);
      console.log("File Type:", file.type);
      console.log("file created");

      stopCamera();
      processImage(file, 'Camera');
    }, 'image/jpeg', 0.98);
  };

  // ─────────────────────────────────────────────
  // MAIN PROCESS
  // ─────────────────────────────────────────────

  const getImageDimensions = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const preprocessForOCR = (imageFile) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        // Apply filters ONLY to the separate OCR copy
        ctx.filter = "contrast(1.2) brightness(1.05)";
        ctx.drawImage(img, 0, 0);
        ctx.filter = "none";
        
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(imageFile); // Fallback to original if blob creation fails
            return;
          }
          const processedFile = new File([blob], `ocr-${imageFile.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(processedFile);
        }, 'image/jpeg', 0.98);
      };
      img.onerror = () => {
        resolve(imageFile); // Fallback to original on error
      };
      img.src = URL.createObjectURL(imageFile);
    });
  };

  const processImage = async (imageFile, source) => {
    // Quality Validation
    if (!imageFile || imageFile.size === 0) {
      addToast('Unable to process captured image. Please retake the photo or improve lighting.', 'error');
      return;
    }

    if (!imageFile.type || !imageFile.type.startsWith('image/')) {
      addToast('Please upload a valid image file.', 'error');
      return;
    }

    // Immediate Preview creation
    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);

    // Validate preview quality before continuing
    const dimensions = await getImageDimensions(imageFile);
    console.log("Name:", imageFile.name);
    console.log("Type:", imageFile.type);
    console.log("Size:", imageFile.size);
    console.log("Image width:", dimensions.width);
    console.log("Image height:", dimensions.height);

    if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
      setPreviewUrl(null); // Clear preview if invalid/blank
      addToast('Unable to process captured image. Please retake the photo or improve lighting.', 'error');
      return;
    }

    setScanning(true);
    setProgress(10);
    setSourceLabel(source);

    try {
      console.log("OCR started");
      addToast(
        navigator.onLine
          ? 'Running OCR.Space scan...'
          : 'Running Offline Tesseract scan...',
        'info'
      );

      setProgress(20);

      // Create separate copy for OCR preprocessing (original image remains untouched)
      const ocrFile = await preprocessForOCR(imageFile);

      const eng2 = await runOCR(
        ocrFile,
        2,
        p => setProgress(20 + Math.round(p * 25))
      );

      setProgress(45);

      const eng1 = await runOCR(
        ocrFile,
        1,
        p => setProgress(45 + Math.round(p * 20))
      );

      const mergedText = mergeOCRTexts(
        eng2.text,
        eng1.text
      );
      console.log('OCR Engine 2:', eng2);
      console.log('OCR Engine 1:', eng1);
      console.log('Merged OCR Text:', mergedText);

      if (!mergedText) {
        throw new Error('OCR returned no text');
      }

      console.log("OCR completed");

      const extractedData = extractCardData(mergedText);
      console.log('[Debug] Structured OCR extraction result:', {
        name: extractedData.name,
        company: extractedData.company,
        phone: extractedData.phone,
        altPhone: extractedData.altPhone,
        email: extractedData.email,
        altEmail: extractedData.altEmail,
        title: extractedData.title,
        website: extractedData.website,
        address: extractedData.address
      });
      
      // Preserve original imageFile (without filters) for database and display
      extractedData.imageBlob = imageFile;

      setProgress(100);
      setTimeout(() => {
        setScanning(false);
        addToast('Scan complete!', 'success');
        onCardScanned(extractedData, objectUrl);
      }, 500);

    } catch (error) {
      console.error(error);
      // Customized user-friendly error messages
      const userMessage = source === 'Camera'
        ? 'Unable to process captured image. Please retake the photo or improve lighting.'
        : (error.message || 'OCR returned no text. Please try a clearer image.');
      addToast(userMessage, 'error');
      setScanning(false);
    }
  };

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  return (
    <div className="page-content">

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Capture Card
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Instant AI extraction from any business card.
        </p>
      </div>

      {cameraOpen ? (

        <div className="scan-area" style={{ marginBottom: 24 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={handleVideoCanPlay}
            onPlay={handleVideoCanPlay}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div className="scan-frame">
            <div className="scan-corner tl" />
            <div className="scan-corner tr" />
            <div className="scan-corner bl" />
            <div className="scan-corner br" />
          </div>
          <div style={{
            position: 'absolute', bottom: 20, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 20
          }}>
            <button className="btn" onClick={stopCamera}>Close</button>
            <button 
              className="btn" 
              onClick={captureSnapshot}
              disabled={!videoReady}
            >
              Capture
            </button>
          </div>
        </div>

      ) : (

        <div className="scan-area" style={{ marginBottom: 24 }}>
          {previewUrl ? (
            <img
              src={previewUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              alt="Preview"
            />
          ) : (
            <div className="scan-placeholder">
              <div className="scan-placeholder-icon">📷</div>
              <span>Upload or Take Photo</span>
            </div>
          )}
          {scanning && (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%',
              transform: 'translateX(-50%)', background: 'black',
              color: 'white', padding: '8px 20px', borderRadius: 99
            }}>
              Reading Card... {progress}%
            </div>
          )}
        </div>

      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={openCamera}
          disabled={scanning}
        >
          Take Photo
        </button>
        <button
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => galleryRef.current.click()}
          disabled={scanning}
        >
          Upload
        </button>
      </div>

      {/* Premium Feature Flash Cards */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: 2 }}>
          AI Core Features
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: 12 
        }}>
          {/* Card 1: Fast OCR */}
          <div style={{
            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
            border: '1px solid #BFDBFE',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
          >
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 10, 
              background: 'var(--primary)', 
              color: 'white', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <span className="material-icons" style={{ fontSize: 18 }}>offline_bolt</span>
            </div>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Fast OCR</h4>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>In-browser local AI engine reads card text instantly.</p>
            </div>
          </div>

          {/* Card 2: Offline First */}
          <div style={{
            background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
            border: '1px solid #BBF7D0',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
          >
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 10, 
              background: 'var(--success)', 
              color: 'white', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <span className="material-icons" style={{ fontSize: 18 }}>wifi_off</span>
            </div>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>100% Offline</h4>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>Fully works without internet. Scan, edit, & save instantly.</p>
            </div>
          </div>

          {/* Card 3: Smart Match */}
          <div style={{
            background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
            border: '1px solid #FDE68A',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
          >
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 10, 
              background: 'var(--warning)', 
              color: 'white', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <span className="material-icons" style={{ fontSize: 18 }}>call_merge</span>
            </div>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Smart Match</h4>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>Detects duplicate contacts instantly in local DB.</p>
            </div>
          </div>

          {/* Card 4: Action Queue */}
          <div style={{
            background: 'linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%)',
            border: '1px solid #E9D5FF',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
          >
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 10, 
              background: '#7C3AED', 
              color: 'white', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <span className="material-icons" style={{ fontSize: 18 }}>sync</span>
            </div>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Smart Queue</h4>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>Queues follow-ups and CRM syncs until online.</p>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files[0]) processImage(e.target.files[0], 'Gallery');
          e.target.value = '';
        }}
      />

      <canvas ref={canvasRef} style={{ display: 'none' }} />

    </div>
  );
}   