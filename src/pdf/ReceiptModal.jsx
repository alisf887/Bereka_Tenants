import Receipt from "./Receipt";

/**
 * Print-preview modal. Opened automatically after a payment is recorded
 * (see App.jsx's openReceipt()). Print and Download PDF both live inside
 * Receipt.jsx itself — this component is just the overlay chrome.
 */
export default function ReceiptModal({ tenant, payment, onClose }) {
  if (!tenant || !payment) return null;

  return (
    <>
      <div className="scrim no-print" onClick={onClose} />
      <div className="receipt-modal-wrap no-print">
        <div className="receipt-modal">
          <button
            className="btn close"
            aria-label="ዝጋ"
            onClick={onClose}
            style={{ position: "absolute", top: 10, right: 10 }}
          >
            ✕
          </button>
          <Receipt tenant={tenant} payment={payment} />
        </div>
      </div>
    </>
  );
}