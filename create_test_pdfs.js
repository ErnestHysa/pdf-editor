const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const fixturesDir = './test-fixtures';
if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

// 1. empty.pdf - blank document
const emptyDoc = new PDFDocument();
emptyDoc.pipe(fs.createWriteStream(path.join(fixturesDir, 'empty.pdf')));
emptyDoc.end();

// 2. text_document.pdf - document with existing text
const textDoc = new PDFDocument();
textDoc.pipe(fs.createWriteStream(path.join(fixturesDir, 'text_document.pdf')));
textDoc.fontSize(14).text('This is a sample text document for testing.', 50, 50);
textDoc.fontSize(12).text('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 50, 80);
textDoc.fontSize(12).text('Search for the word "testing" in this document.', 50, 110);
textDoc.fontSize(12).text('Another line of text here for find functionality.', 50, 140);
textDoc.end();

// 3. multi_page.pdf - 3-page document
const multiDoc = new PDFDocument();
multiDoc.pipe(fs.createWriteStream(path.join(fixturesDir, 'multi_page.pdf')));
multiDoc.fontSize(16).text('Page 1', 50, 50);
multiDoc.addPage();
multiDoc.fontSize(16).text('Page 2', 50, 50);
multiDoc.addPage();
multiDoc.fontSize(16).text('Page 3', 50, 50);
multiDoc.end();

// 4. annotated.pdf - document with annotations
const annotDoc = new PDFDocument();
annotDoc.pipe(fs.createWriteStream(path.join(fixturesDir, 'annotated.pdf')));
annotDoc.fontSize(14).text('Document with annotations', 50, 50);
annotDoc.fontSize(12).text('Highlight this text to test highlighting.', 50, 80);
annotDoc.end();

console.log('PDF fixtures created in:', fixturesDir);
