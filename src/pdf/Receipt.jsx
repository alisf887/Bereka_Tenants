import { birrToWords } from "./birrWords";
import { generateReceipt } from "./generateReceipt";

export default function Receipt({ tenant = {}, payment = {} }) {
  const total = Number(payment.total) || 0;
  const net = total / 1.15;
  const vat = total - net;

  return (
    <div style={{ padding: "20px" }}>
      {/* Print-only CSS: when printing, show ONLY #receipt, hide everything
          else on the page (the modal chrome, the buttons below). Scoped to
          this component so it works wherever Receipt is rendered. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={generateReceipt}
          style={{ padding: "10px 16px", cursor: "pointer" }}
        >
          Download PDF Receipt
        </button>
        <button
          onClick={() => window.print()}
          style={{ padding: "10px 16px", cursor: "pointer" }}
        >
          Print
        </button>
      </div>

      <div id="receipt" style={{ background: "white", padding: "30px", color: "#111" }}>
        <h1>በረካ ህንፃ</h1>
        <h2>BEREKA BUILDING</h2>

        <hr />

        <h3>የኪራይ ክፍያ ደረሰኝ</h3>

        <p>Receipt No: {payment.receipt_no || "N/A"}</p>

        <table>
          <tbody>
            <tr><td>ስም</td><td>{tenant.name || "N/A"}</td></tr>
            <tr><td>ክፍል</td><td>{tenant.room || "N/A"}</td></tr>
            <tr><td>ወለል</td><td>{tenant.floor || "N/A"}</td></tr>
          </tbody>
        </table>

        <hr />

        <h3>Payment</h3>

        <p>Total: {total.toLocaleString()} Birr</p>
        <p>Net: {net.toFixed(2)} Birr</p>
        <p>VAT: {vat.toFixed(2)} Birr</p>

        <hr />

        <h3>In Words</h3>

        <p>{birrToWords(total)}</p>

        <div style={{ marginTop: "80px" }}>
          <div>Receiver</div>
          <strong>Ali Seid</strong>
        </div>
      </div>
    </div>
  );
}