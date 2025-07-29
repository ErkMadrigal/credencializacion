const fs = require('fs');
const cheerio = require('cheerio');
const sharp = require('sharp');
const XLSX = require('xlsx');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageOrientation,
  ImageRun,
  BorderStyle,
} = require('docx');

// Argumento Excel
const excelPath = process.argv[2];
if (!excelPath) {
  console.error("❌ Debes proporcionar el archivo .xlsx como argumento");
  process.exit(1);
}

// Añade al inicio del script


const svgPath = path.resolve(__dirname, 'plantillas/Credenciales_Laumir.svg');
const imagePath = path.resolve(__dirname, 'foto.png');
const outputDir = path.resolve(__dirname, 'output');
const outputDocxPath = path.resolve(outputDir, 'credenciales_generadas.docx');

console.log('Ruta absoluta de salida DOCX:', outputDocxPath);
console.log('Directorio de salida existe?', fs.existsSync(outputDir));
console.log('Permisos de escritura?', fs.accessSync(outputDir, fs.constants.W_OK));

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
  console.log('📁 Carpeta output creada:', outputDir);
}

// Verificación de archivos necesarios
if (!fs.existsSync(svgPath)) {
  console.error(`❌ No se encontró la plantilla SVG en: ${svgPath}`);
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`❌ No se encontró la imagen en: ${imagePath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const excelData = XLSX.utils.sheet_to_json(worksheet, {
  header: ['text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8', 'text9', 'text10', 'text11']
}).slice(1); // Saltar encabezado

async function generateCredential(row, index) {
  console.log(`\n🔄 Generando credencial ${index + 1}`);

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const imageMimeType = 'image/png';

  const $ = cheerio.load(svgContent, { xmlMode: true });
  $('svg').attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  for (const key in row) {
    const tspan = $(`#${key}`).find('tspan');
    if (tspan.length) {
      if (key === 'text6' || key === 'text7') {
        const excelDate = parseFloat(row[key]);
        if (!isNaN(excelDate)) {
          const date = XLSX.SSF.parse_date_code(excelDate);
          const formattedDate = `${date.d.toString().padStart(2, '0')}/${date.m.toString().padStart(2, '0')}/${date.y}`;
          tspan.text(formattedDate);
        } else {
          tspan.text(row[key]);
        }
      } else {
        tspan.text(row[key]);
      }
    } else {
      console.warn(`⚠️ No se encontró elemento con ID: ${key}`);
    }
  }

  const rect = $('#rect11');
  if (rect.length) {
    const x = rect.attr('x');
    const y = rect.attr('y');
    const width = rect.attr('width');
    const height = rect.attr('height');

    const imageTag = `
      <image
        id="img1"
        x="${x}"
        y="${y}"
        width="${width}"
        height="${height}"
        xlink:href="data:${imageMimeType};base64,${imageBase64}" />
    `;
    rect.replaceWith(imageTag);
    console.log(`✅ Imagen insertada para credencial ${index + 1}`);
  } else {
    console.warn('⚠️ No se encontró <rect id="rect11">');
  }

  const outputSvgPath = path.join(outputDir, `credencial_${index + 1}.svg`);
  const nuevoSvg = $.xml();
  fs.chmodSync(outputDir, 0o777);
  fs.writeFileSync(outputSvgPath, nuevoSvg);
  console.log(`✅ SVG guardado: ${outputSvgPath}`);

  console.log('Verifica archivo en:', outputDocxPath);
console.log('¿Existe el archivo? ', fs.existsSync(outputDocxPath));

  const outputPngPath = path.join(outputDir, `credencial_${index + 1}.png`);
  await sharp(Buffer.from(nuevoSvg))
    .png()
    .resize({ width: 1400, height: 1000 })
    .toFile(outputPngPath);
  console.log(`✅ PNG generado: ${outputPngPath}`);

  return outputPngPath;
}

async function createDocWithCredentials(pngPaths) {
  console.log('🟢 Creando documento Word con las credenciales...');

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      },
      children: [
        new Table({
          rows: Array.from({ length: Math.ceil(pngPaths.length / 2) }, (_, rowIndex) => {
            const cells = [];

            if (pngPaths[rowIndex * 2]) {
              const imageBuffer = fs.readFileSync(pngPaths[rowIndex * 2]);
              cells.push(new TableCell({
                children: [new Paragraph({
                  children: [new ImageRun({
                    data: imageBuffer,
                    transformation: { width: Math.round(20 * 28.35), height: Math.round(13.5 * 28.35) },
                  })],
                })],
                width: { size: Math.round(20 * 28.35), type: WidthType.DXA },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                },
              }));
            }

            if (pngPaths[rowIndex * 2 + 1]) {
              const imageBuffer = fs.readFileSync(pngPaths[rowIndex * 2 + 1]);
              cells.push(new TableCell({
                children: [new Paragraph({
                  children: [new ImageRun({
                    data: imageBuffer,
                    transformation: { width: Math.round(20 * 28.35), height: Math.round(13.5 * 28.35) },
                  })],
                })],
                width: { size: Math.round(20 * 28.35), type: WidthType.DXA },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                },
              }));
            } else {
              cells.push(new TableCell({
                children: [],
                width: { size: Math.round(20 * 28.35), type: WidthType.DXA },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                },
              }));
            }

            return new TableRow({ children: cells });
          }),
          width: { size: Math.round(28 * 28.35), type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
      ],
    }],
  });

  try {
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputDocxPath, buffer);
    console.log('🧪 Verificando si el archivo .docx fue realmente escrito...');
    console.log('📄 ¿Existe?', fs.existsSync(outputDocxPath));
    console.log('📁 Path actual (cwd):', process.cwd());
    console.log('__dirname:', __dirname);
    console.log(`✅ Documento Word creado correctamente en: ${outputDocxPath}`);
  } catch (error) {
    console.error('❌ Error al crear el documento Word:', error);
    throw error;
  }
}

async function main() {
  try {
    const pngPaths = [];
    for (let i = 0; i < excelData.length; i++) {
      const pngPath = await generateCredential(excelData[i], i);
      pngPaths.push(pngPath);
    }
    await createDocWithCredentials(pngPaths);
    console.log('✅ Proceso completado.');
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

main();
