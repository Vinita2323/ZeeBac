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

// Generate Smart Cashback Settlement Passbook PDF
export const generateCashbackPassbookPDF = (settlements, vendorName, dateRangeLabel, stats = {}) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(66, 0, 147); // Primary purple
  doc.text('ZeeBac - Cashback & Settlement Passbook', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Store: ${vendorName || 'Vendor Store'}`, 14, 28);
  doc.text(`Period: ${dateRangeLabel || 'All Time'}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 14, 40);

  // Period Summary Box
  if (stats && (stats.rangeIssued !== undefined || stats.rangeRedeemed !== undefined)) {
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(14, 45, 182, 16, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(66, 0, 147);
    doc.text(
      `Period Summary: Issued: +${(stats.rangeIssued || 0).toLocaleString()} Pts  |  Redeemed: -${(stats.rangeRedeemed || 0).toLocaleString()} Pts  |  Net: ${(stats.rangeNet || 0).toLocaleString()} Pts  |  Total Entries: ${stats.totalCount || settlements.length}`,
      18,
      55
    );
  }

  const tableData = settlements.map((item) => {
    const isIssued = item.type === 'ISSUED';
    const pointsStr = isIssued ? `+${item.amount} Pts` : `-${item.amount} Pts`;
    const customer = item.customerName ? `${item.customerName} (${item.customerZeebacId || ''})` : (item.customerZeebacId || '-');
    const ref = item.billNumber || item.orderId || (item.referenceId ? String(item.referenceId).substring(0, 8) : '-');
    const billAmt = item.eligiblePaidAmount ? `₹${item.eligiblePaidAmount}` : '-';
    const rate = item.cashbackPercentage ? `${item.cashbackPercentage}%` : '-';

    return [
      new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      isIssued ? 'Cashback Issued' : (item.type === 'REDEEMED' ? 'Cashback Redeemed' : item.type),
      customer,
      ref,
      billAmt,
      rate,
      pointsStr,
    ];
  });

  autoTable(doc, {
    startY: stats && (stats.rangeIssued !== undefined) ? 66 : 48,
    head: [['Date & Time', 'Type', 'Customer', 'Bill / Order #', 'Bill Paid', 'Rate', 'Points']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [66, 0, 147] },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      6: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 6) {
        if (String(data.cell.raw).startsWith('+')) {
          data.cell.styles.textColor = [0, 128, 0];
        } else {
          data.cell.styles.textColor = [220, 53, 69];
        }
      }
    },
  });

  doc.save(`ZeeBac_Cashback_Passbook_${Date.now()}.pdf`);
};

// Generate Retail Thermal / POS Receipt PDF (Matching Zeebac Store Receipt)
export const generateReceiptPDF = (bill) => {
  if (!bill) return;
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 200], // 80mm thermal receipt format
  });

  const pageWidth = 80;
  let y = 10;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(66, 0, 147); // Zeebac primary
  doc.text(bill.vendorStoreName || 'ZEEBAC STORE', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Zeebac Store ID: ${bill.vendorZeebacId || 'ZBV-STORE'}`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('Verified Merchant Store', pageWidth / 2, y, { align: 'center' });
  y += 4;
  if (bill.vendorPhone) {
    doc.text(`Ph: ${bill.vendorPhone}`, pageWidth / 2, y, { align: 'center' });
    y += 4;
  }
  if (bill.vendorAddress) {
    const rawAddr = typeof bill.vendorAddress === 'object'
      ? [bill.vendorAddress.fullAddress || bill.vendorAddress.street, bill.vendorAddress.landmark, bill.vendorAddress.city, bill.vendorAddress.state, bill.vendorAddress.pincode].filter(Boolean).join(', ')
      : String(bill.vendorAddress);
    const splitAddr = doc.splitTextToSize(rawAddr, 70);
    doc.text(splitAddr, pageWidth / 2, y, { align: 'center' });
    y += splitAddr.length * 3.5;
  }

  // Dotted separator
  y += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(180, 180, 180);
  doc.line(5, y, 75, y);
  y += 4;

  // Metadata
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);

  const printRow = (label, val, isBoldVal = false) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, 6, y);
    doc.setFont('helvetica', isBoldVal ? 'bold' : 'normal');
    doc.text(String(val), 74, y, { align: 'right' });
    y += 4;
  };

  printRow('Tax Invoice / Bill No:', bill.billNumber || bill.transactionId || 'N/A', true);
  
  let dateFormatted = '';
  try {
    const rawD = bill.date || bill.createdAt || bill.timestamp || Date.now();
    const d = new Date(rawD);
    dateFormatted = isNaN(d.getTime()) ? String(rawD) : d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    dateFormatted = new Date().toLocaleString('en-IN');
  }
  printRow('Date & Time:', dateFormatted);
  printRow('Customer:', bill.customerName || 'Valued Customer');
  if (bill.customerZeebacId) {
    printRow('Customer ID:', bill.customerZeebacId, true);
  }
  printRow('Payment Mode:', bill.paymentMethod || 'Cash');

  // Dotted separator
  y += 1;
  doc.line(5, y, 75, y);
  y += 4;

  // Items table
  const items = Array.isArray(bill.items) && bill.items.length > 0
    ? bill.items
    : [{ name: 'Store Purchase', quantity: 1, price: bill.amount, total: bill.amount }];

  const tableBody = items.map((it) => [
    it.name || 'Store Item',
    String(it.quantity || 1),
    `₹${Number(it.price || 0).toFixed(0)}`,
    `₹${Number(it.total || (it.price * it.quantity) || 0).toFixed(0)}`
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: 5, right: 5 },
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fontSize: 7.5,
      fontStyle: 'bold',
      textColor: [80, 80, 80],
      fillColor: [245, 245, 245],
      cellPadding: 1.5,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [30, 30, 30],
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { halign: 'center', cellWidth: 10 },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 14, fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 3;

  // Dotted separator
  doc.line(5, y, 75, y);
  y += 4;

  // Grand Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text('Grand Total:', 6, y);
  doc.text(`₹${Number(bill.amount || 0).toFixed(0)}`, 74, y, { align: 'right' });
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('GST (Statutory Included):', 6, y);
  doc.text('₹0 (Inc.)', 74, y, { align: 'right' });
  y += 5;

  // Instant Cashback Box
  if (Number(bill.cashbackAmount) > 0) {
    doc.setFillColor(243, 232, 255);
    doc.roundedRect(6, y, 68, 14, 2, 2, 'F');
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 33, 168);
    doc.text('ZEEBAC INSTANT REWARD', pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFontSize(9);
    doc.text(`+₹${Number(bill.cashbackAmount).toFixed(0)} Cashback`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Points Credited Instantly to Customer Wallet!', pageWidth / 2, y, { align: 'center' });
    y += 5;
  }

  // Footer
  y += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('Thank you for shopping with us!', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('Powered by Zeebac Retail POS Network', pageWidth / 2, y, { align: 'center' });

  // Save PDF
  const safeBillNo = (bill.billNumber || bill.transactionId || 'Bill').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Zeebac_Receipt_${safeBillNo}.pdf`);
};
