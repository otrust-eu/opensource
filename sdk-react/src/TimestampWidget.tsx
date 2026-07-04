/**
 * Timestamp Widget Component
 * 
 * Drag-and-drop file upload for creating timestamps.
 */

import { 
  useState, 
  useCallback, 
  useRef, 
  type CSSProperties, 
  type DragEvent,
  type ChangeEvent 
} from 'react';
import { timestamp, type TimestampClaim } from '@otrust/sdk';
import { UploadIcon, CheckIcon, ErrorIcon } from './icons.js';

export interface TimestampWidgetProps {
  /** Callback when timestamp is created */
  onTimestamp?: (claim: TimestampClaim) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Allow multiple files */
  multiple?: boolean;
  /** Accepted file types (e.g., '.pdf,.doc') */
  accept?: string;
  /** Max file size in bytes */
  maxSize?: number;
  /** Show progress during hashing */
  showProgress?: boolean;
  /** Email for blockchain confirmation notification */
  notifyEmail?: string;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

interface FileStatus {
  file: File;
  status: 'pending' | 'hashing' | 'uploading' | 'done' | 'error';
  progress: number;
  claim?: TimestampClaim;
  error?: string;
}

/**
 * Drag-and-drop timestamp widget.
 * 
 * @example
 * ```tsx
 * <TimestampWidget
 *   onTimestamp={(claim) => console.log('Timestamped:', claim.receiptId)}
 *   onError={(err) => console.error(err)}
 *   showProgress
 * />
 * ```
 */
export function TimestampWidget({
  onTimestamp,
  onError,
  multiple = false,
  accept,
  maxSize = 100 * 1024 * 1024, // 100MB default
  showProgress = true,
  notifyEmail,
  className = '',
  style,
}: TimestampWidgetProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File): Promise<FileStatus> => {
    const status: FileStatus = {
      file,
      status: 'hashing',
      progress: 0,
    };

    try {
      // Check file size
      if (file.size > maxSize) {
        throw new Error(`File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`);
      }

      // Update to hashing status
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, status: 'hashing' } : f
      ));

      // Create timestamp with progress
      status.status = 'uploading';
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, status: 'uploading', progress: 50 } : f
      ));

      const result = await timestamp.create(file, {
        filename: file.name,
        email: notifyEmail,
      });

      if (result.ok) {
        status.status = 'done';
        status.claim = result.value;
        status.progress = 100;
        onTimestamp?.(result.value);
      } else {
        throw new Error(result.error.message);
      }
    } catch (error) {
      status.status = 'error';
      status.error = error instanceof Error ? error.message : 'Unknown error';
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    return status;
  }, [maxSize, notifyEmail, onTimestamp, onError]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => ({
      file,
      status: 'pending' as const,
      progress: 0,
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Process files sequentially
    for (const fileStatus of newFiles) {
      const result = await processFile(fileStatus.file);
      setFiles(prev => prev.map(f => 
        f.file === fileStatus.file ? result : f
      ));
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // Styles
  const containerStyles: CSSProperties = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    ...style,
  };

  const dropzoneStyles: CSSProperties = {
    border: `2px dashed ${isDragging ? '#2563eb' : '#d1d5db'}`,
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className={`otrust-timestamp-widget ${className}`} style={containerStyles}>
      <div
        style={dropzoneStyles}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to upload"
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        <UploadIcon
          size={48}
          color="#6b7280"
          style={{ margin: '0 auto 16px' }}
        />
        <p style={{ margin: 0, fontSize: '16px', color: '#374151' }}>
          <strong>Drop files here</strong> or click to browse
        </p>
        <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#6b7280' }}>
          Files will be timestamped on Bitcoin blockchain
        </p>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {files.map((f, idx) => (
            <div
              key={`${f.file.name}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginBottom: '8px',
              }}
            >
              {f.status === 'done' ? (
                <CheckIcon size={24} color="#16a34a" />
              ) : f.status === 'error' ? (
                <ErrorIcon size={24} color="#dc2626" />
              ) : (
                <UploadIcon size={24} color="#6b7280" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.file.name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  {formatFileSize(f.file.size)}
                  {f.status === 'done' && f.claim && (
                    <span style={{ marginLeft: '8px', color: '#16a34a' }}>
                      ✓ {f.claim.receiptId}
                    </span>
                  )}
                  {f.status === 'error' && (
                    <span style={{ marginLeft: '8px', color: '#dc2626' }}>
                      {f.error}
                    </span>
                  )}
                </p>
                {showProgress && (f.status === 'hashing' || f.status === 'uploading') && (
                  <div style={{ marginTop: '8px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${f.progress}%`,
                        height: '100%',
                        backgroundColor: '#2563eb',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
