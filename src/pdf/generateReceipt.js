import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function generateReceipt(){

const receipt=document.getElementById("receipt");

const canvas=await html2canvas(receipt,{scale:2});

const img=canvas.toDataURL("image/png");

const pdf=new jsPDF("p","mm","a4");

pdf.addImage(img,"PNG",10,10,190,277);

pdf.save("receipt.pdf");

}