/**
 * OTRUST Icon Components
 * 
 * Safe SVG icon components - no dangerouslySetInnerHTML.
 * All icons are statically defined React components.
 */

import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
  'aria-hidden'?: boolean;
}

/**
 * OTRUST Logo - Green circle with clock hands (timestamp symbol)
 */
export function OTrustIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <circle cx="16" cy="16" r="14" fill={color} />
      <path
        d="M16 8v8l6 3"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Upload Icon
 */
export function UploadIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
    </svg>
  );
}

/**
 * Checkmark Icon
 */
export function CheckIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

/**
 * Error Icon
 */
export function ErrorIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

/**
 * Shield Icon
 */
export function ShieldIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
    </svg>
  );
}

/**
 * Clock Icon (for pending/loading states)
 */
export function ClockIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
    </svg>
  );
}

/**
 * Warning Icon
 */
export function WarningIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

/**
 * Document Icon
 */
export function DocumentIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  );
}

/**
 * Signature Icon
 */
export function SignatureIcon({ size = 24, color = 'currentColor', style, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}
