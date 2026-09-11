let imageFiles = [];

const dropArea = document.getElementById('dropArea');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
});

dropArea.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  handleFiles(files);
});

function handleFiles(files) {
  const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
  validFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      imageFiles.push({ id: Math.random(), src: e.target.result });
      renderPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreview() {
  const grid = document.getElementById('previewGrid');
  const status = document.getElementById('statusText');
  const btn = document.getElementById('convertBtn');
  
  grid.innerHTML = '';

  if (imageFiles.length === 0) {
    status.innerText = "No images selected yet";
    btn.disabled = true;
    return;
  }

  status.innerText = `Selected Images (${imageFiles.length}):`;
  btn.disabled = false;

  imageFiles.forEach((imgObj, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${imgObj.src}">
      <div class="card-tools">
        <button onclick="shiftImg(${index}, -1)" ${index === 0 ? 'disabled' : ''}>◄</button>
        <button onclick="removeImage(${index})">✖</button>
        <button onclick="shiftImg(${index}, 1)" ${index === imageFiles.length - 1 ? 'disabled' : ''}>►</button>
      </div>
    `;
    grid.appendChild(item);
  });
}

function removeImage(index) {
  imageFiles.splice(index, 1);
  renderPreview();
}

function shiftImg(i, dir) {
  const target = i + dir;
  if (target >= 0 && target < imageFiles.length) {
    const temp = imageFiles[i];
    imageFiles[i] = imageFiles[target];
    imageFiles[target] = temp;
    renderPreview();
  }
}

function resetAll() {
  imageFiles = [];
  document.getElementById('fileInput').value = '';
  document.getElementById('wmarkText').value = '';
  renderPreview();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 };
}

async function generatePDF() {
  if (imageFiles.length === 0) return;

  const convertBtn = document.getElementById('convertBtn');
  convertBtn.innerText = "Generating PDF...";
  convertBtn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const format = document.getElementById('pageSize').value;
    const orient = document.getElementById('pOrient').value;
    const margin = parseInt(document.getElementById('pMargin').value);
    const filter = document.getElementById('imgFilter').value;
    const fileName = document.getElementById('fileName').value.trim() || 'Document';
    const pageNum = document.getElementById('addNumbers').value;

    const wText = document.getElementById('wmarkText').value.trim();
    const wPos = document.getElementById('wmPosition').value;
    const wSize = parseInt(document.getElementById('wmSize').value) || 30;
    const wAngle = parseInt(document.getElementById('wmAngle').value) || 0;
    const wOpacity = parseFloat(document.getElementById('wmOpacity').value) || 0.4;
    const wColorHex = document.getElementById('wmColor').value;
    const rgb = hexToRgb(wColorHex);

    let doc;

    for (let i = 0; i < imageFiles.length; i++) {
      let src = imageFiles[i].src;
      if (filter === 'grayscale') src = await applyGrayscale(src);

      const imgProps = await getImgSize(src);

      if (i === 0) {
        if (format === 'fit') {
          doc = new jsPDF({ orientation: imgProps.w > imgProps.h ? 'l' : 'p', unit: 'pt', format: [imgProps.w, imgProps.h] });
        } else {
          doc = new jsPDF(orient, 'mm', format);
        }
      } else {
        if (format === 'fit') {
          doc.addPage([imgProps.w, imgProps.h], imgProps.w > imgProps.h ? 'l' : 'p');
        } else {
          doc.addPage(format, orient);
        }
      }

      const pWidth = doc.internal.pageSize.getWidth();
      const pHeight = doc.internal.pageSize.getHeight();
      const printableW = pWidth - (margin * 2);
      const printableH = pHeight - (margin * 2);

      let renderW = printableW;
      let renderH = (imgProps.h * printableW) / imgProps.w;

      if (renderH > printableH) {
        renderH = printableH;
        renderW = (imgProps.w * printableH) / imgProps.h;
      }

      const posX = margin + (printableW - renderW) / 2;
      const posY = margin + (printableH - renderH) / 2;

      doc.addImage(src, 'JPEG', posX, posY, renderW, renderH);

      if (wText !== '') {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: wOpacity }));
        doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.setFontSize(wSize);

        let wx = pWidth / 2;
        let wy = pHeight / 2;
        let align = 'center';

        if (wPos === 'top-left') { wx = 20; wy = 30; align = 'left'; }
        else if (wPos === 'top-right') { wx = pWidth - 20; wy = 30; align = 'right'; }
        else if (wPos === 'bottom-left') { wx = 20; wy = pHeight - 30; align = 'left'; }
        else if (wPos === 'bottom-right') { wx = pWidth - 20; wy = pHeight - 30; align = 'right'; }

        doc.text(wText, wx, wy, { align: align, angle: wAngle });
        doc.restoreGraphicsState();
      }

      if (pageNum === 'yes') {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text(`Page ${i + 1} of ${imageFiles.length}`, pWidth - 15, pHeight - 10, { align: 'right' });
      }
    }

    doc.save(`${fileName}.pdf`);
  } catch (err) {
    alert("Error generating PDF: " + err.message);
  } finally {
    convertBtn.innerText = "Convert & Download PDF";
    convertBtn.disabled = false;
  }
}

function getImgSize(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res({ w: img.width, h: img.height });
    img.src = src;
  });
}

function applyGrayscale(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');
      cvs.width = img.width; cvs.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const avg = (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) / 3;
        imgData.data[i] = avg; imgData.data[i + 1] = avg; imgData.data[i + 2] = avg;
      }
      ctx.putImageData(imgData, 0, 0);
      res(cvs.toDataURL('image/jpeg'));
    };
    img.src = src;
  });
}
