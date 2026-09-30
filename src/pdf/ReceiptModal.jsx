import { useEffect, useRef } from "react";
import Receipt from "./Receipt";

/**
 * Print-preview modal. Opened automatically after a payment is recorded
 * (see App.jsx's openReceipt()). Print and Download PDF both live inside
 * Receipt.jsx itself — this component is just the overlay chrome.
 *
 * The dimmed/blurred backdrop comes from .receipt-modal-wrap in styles.css,
 * so no separate .scrim is needed.
 */
export default function ReceiptModal({ tenant, payment, onClose }) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef(null);
  const pressedOnBackdrop = useRef(false);

  // Keep the latest onClose without re-subscribing listeners on every parent render
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Escape closes
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onCloseRef.current(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While open: hide the page behind it when printing, lock background scroll,
  // move focus into the dialog, and restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add("receipt-open");
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.classList.remove("receipt-open");
      document.body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  if (!tenant || !payment) return null;

  return (
    <div
      className="receipt-modal-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="ደረሰኝ"
      // Close only when the press AND release both happen on the backdrop,
      // so selecting text inside the receipt and releasing outside doesn't close it.
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="receipt-modal" ref={dialogRef} tabIndex={-1} style={{ outline: "none" }}>
        <button className="btn close no-print" aria-label="ዝጋ" onClick={onClose}>
          ✕
        </button>
        <Receipt tenant={tenant} payment={payment} />
      </div>
    </div>
  );
}