import { useEffect } from "react";
import Receipt from "./Receipt";

/**
 * Print-preview modal. Opened automatically after a payment is recorded
 * (see App.jsx's openReceipt()). Print and Download PDF both live inside
 * Receipt.jsx itself — this component is just the overlay chrome.
 *
 * The dimmed/blurred backdrop comes from .receipt-modal-wrap in styles.css,
 * so no separate .scrim is needed (it would double the dimming and the
 * full-screen wrap would sit on top of it, blocking outside clicks anyway).
 */
export default function ReceiptModal({ tenant, payment, onClose }) {
  // Close with the Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // While open, tell the print stylesheet to drop the page behind the receipt
  // (visibility:hidden alone still reserves space and prints blank pages).
  useEffect(() => {
    document.body.classList.add("receipt-open");
    return () => document.body.classList.remove("receipt-open");
  }, []);

  if (!tenant || !payment) return null;

  return (
    <div
      className="receipt-modal-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="ደረሰኝ"
      onClick={onClose}
    >
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="btn close no-print" aria-label="ዝጋ" onClick={onClose}>
          ✕
        </button>
        <Receipt tenant={tenant} payment={payment} />
      </div>
    </div>
  );
}