import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// QR Image Download helper
export const downloadImage = async (url, filename) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename || 'download.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Failed to download image:", error);
    alert("Failed to download image.");
  }
};

// Native Share Helper
export const shareContent = async (url, title, text) => {
  if (navigator.share) {
    try {
      // Trying to fetch the blob to share it as a file (looks better in WhatsApp)
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], 'store-qr.png', { type: blob.type });

      await navigator.share({
        title: title || 'My Zeebac Store',
        text: text || 'Scan my QR code to pay and earn cashback!',
        files: [file],
      });
    } catch (error) {
      console.log('Error sharing:', error);
      // Fallback if sharing files is not supported or failed
      try {
        await navigator.share({ title, text, url });
      } catch(e) {
         console.log(e);
      }
    }
  } else {
    alert("Your browser doesn't support direct sharing. You can download it instead!");
  }
};

// Generate Passbook PDF
export const generatePassbookPDF = (ledgerEntries, vendorName, dateRangeLabel) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(66, 0, 147); // Primary color
  doc.text('ZeeBac - Wallet Passbook', 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Store: ${vendorName || 'Vendor'}`, 14, 30);
  doc.text(`Period: ${dateRangeLabel}`, 14, 36);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 42);

  // Table Data Formatting
  const tableData = ledgerEntries.map((entry) => {
    // If amount is a string like "+₹1,000", clean it up, otherwise leave it
    let cleanAmount = typeof entry.amount === 'string' ? entry.amount.replace('₹', '') : entry.amount;
    
    return [
      entry.date,
      entry.title || entry.category || entry.desc || 'Transaction',
      entry.type.toLowerCase() === 'credit' ? 'Credit' : 'Debit',
      cleanAmount,
      entry.status || 'Completed',
    ];
  });

  // Generate Table
  autoTable(doc, {
    startY: 50,
    head: [['Date', 'Description', 'Type', 'Amount', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [66, 0, 147] },
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      3: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: function (data) {
      // Color code amount column
      if (data.section === 'body' && data.column.index === 3) {
        if (data.row.raw[2] === 'Credit') {
          data.cell.styles.textColor = [0, 128, 0]; // Green
        } else {
          data.cell.styles.textColor = [220, 53, 69]; // Red
        }
      }
    }
  });

  // Save PDF
  doc.save(`ZeeBac_Passbook_${new Date().getTime()}.pdf`);
};
