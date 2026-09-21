import { birrToWords } from "./birrWords";

export default function Receipt({ tenant, payment }) {

const total = Number(payment.total || 0);

const net = total / 1.15;
const vat = total - net;

return(

<div id="receipt" style={{background:"white",padding:"30px",color:"#111"}}>

<h1>በረካ ህንፃ</h1>
<h2>BEREKA BUILDING</h2>

<hr/>

<h3>የኪራይ ክፍያ ደረሰኝ</h3>

<p>Receipt No: {payment.receipt_no}</p>

<table>
<tbody>

<tr><td>ስም</td><td>{tenant.name}</td></tr>
<tr><td>ክፍል</td><td>{tenant.room}</td></tr>
<tr><td>ወለል</td><td>{tenant.floor}</td></tr>

</tbody>
</table>

<hr/>

<h3>Payment</h3>

<p>Total: {total.toLocaleString()} Birr</p>
<p>Net: {net.toFixed(2)} Birr</p>
<p>VAT: {vat.toFixed(2)} Birr</p>

<hr/>

<h3>In Words</h3>

<p>{birrToWords(total)}</p>

<div style={{marginTop:"80px"}}>

<div>Receiver</div>

<strong>Ali Seid</strong>

</div>

</div>

)

}