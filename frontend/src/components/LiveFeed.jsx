// src/components/LiveFeed.jsx — Camera feed component
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertTriangle, Wifi, WifiOff, Zap } from 'lucide-react';

const STATUS_DISPLAY = {
  normal:       { label: 'Live',         color: 'text-success-DEFAULT', dot: 'status-dot-green'  },
  occluded:     { label: 'Occluded',     color: 'text-warning-DEFAULT', dot: 'status-dot-amber'  },
  no_shelf:     { label: 'No Shelf',     color: 'text-danger-DEFAULT',  dot: 'status-dot-red'    },
  error:        { label: 'Error',        color: 'text-danger-DEFAULT',  dot: 'status-dot-red'    },
  initializing: { label: 'Starting...',  color: 'text-slate-500',       dot: 'status-dot-gray'   },
  demo:         { label: 'Demo Mode',    color: 'text-primary-500',     dot: 'status-dot-green'  },
  offline:      { label: 'Offline',      color: 'text-slate-400',       dot: 'status-dot-gray'   },
};

export default function LiveFeed({ cameraActive, status = 'initializing', isDemoMode, className = '' }) {
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [stream, setStream] = useState(null);

  const displayStatus = STATUS_DISPLAY[isDemoMode ? 'demo' : status] || STATUS_DISPLAY.offline;

  // Start/stop camera stream
  useEffect(() => {
    if (cameraActive && !isDemoMode) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => {
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
          setCameraError(null);
        })
        .catch(err => {
          setCameraError(err.message || 'Camera access denied');
        });
    } else {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [cameraActive, isDemoMode]);

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-navy-500" />
          <span className="font-semibold text-sm text-navy-500">Camera Feed</span>
        </div>
        <div className="flex items-center gap-2">
          {isDemoMode && (
            <span className="badge badge-teal">
              <Zap className="w-3 h-3" />
              Demo
            </span>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`status-dot ${displayStatus.dot}`} />
            <span className={`font-medium ${displayStatus.color}`}>{displayStatus.label}</span>
          </div>
        </div>
      </div>

      {/* Feed area */}
      <div className="relative bg-slate-900 aspect-video">
        {/* Real camera video */}
        {cameraActive && !isDemoMode && !cameraError && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}

        {/* Demo mode display */}
        {isDemoMode && cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-primary-900">
            <div className="text-center text-white">
              <div className="w-16 h-16 rounded-2xl bg-primary-500/20 border border-primary-400/30 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-primary-400" />
              </div>
              <h3 className="font-display font-bold text-lg">Demo Mode Active</h3>
              <p className="text-primary-300 text-sm mt-1">Simulating shelf with AI detections</p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-primary-400">
                <span className="status-dot-green status-dot" />
                <span>Processing synthetic frames</span>
              </div>
            </div>
            {/* Animated shelf simulation */}
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-5 gap-1 opacity-30">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 rounded bg-primary-400"
                  style={{ opacity: Math.random() > 0.2 ? 1 : 0 }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Not active */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-900">
            <CameraOff className="w-10 h-10 opacity-30 mb-3" />
            <p className="text-sm opacity-50">Camera stopped</p>
            <p className="text-xs opacity-30 mt-1">Click Start Camera to begin</p>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white">
            <AlertTriangle className="w-10 h-10 text-warning-DEFAULT mb-3" />
            <p className="text-sm font-medium">Camera Error</p>
            <p className="text-xs opacity-60 mt-1 text-center px-4">{cameraError}</p>
          </div>
        )}

        {/* Live recording badge */}
        {cameraActive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">REC</span>
          </div>
        )}
      </div>
    </div>
  );
}
