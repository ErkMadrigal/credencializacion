const fs = require('fs');
const cheerio = require('cheerio');
const sharp = require('sharp');
const XLSX = require('xlsx');
const path = require('path');
const axios = require('axios');
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

const svgPath = path.resolve(__dirname, 'plantillas/Credencial_serprosep.svg');
const outputDir = path.resolve(__dirname, 'output');
const outputDocxPath = path.resolve(outputDir, 'credenciales_generadas.docx');

// Verificación de archivos y directorios
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
  console.log('📁 Carpeta output creada:', outputDir);
}

if (!fs.existsSync(svgPath)) {
  console.error(`❌ No se encontró la plantilla SVG en: ${svgPath}`);
  process.exit(1);
}
// Leer el archivo Excel con la estructura específica
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convertir a JSON con los nombres de columna específicos
const excelData = XLSX.utils.sheet_to_json(worksheet, {
  header: ['puesto', 'curp', 'telefono', 'tipo_sangre', 'alergia', 'fecha_expedicion', 'fecha_vigencia', 'familiar', 'parentesco', 'telefono_parentesco', 'nombre_elemento', 'url_imagen'],
  defval: "" // Valor por defecto para celdas vacías
}).slice(1); // Saltar encabezado

console.log('Datos del Excel:', excelData);

async function downloadImage(url, outputPath) {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer'
    });
    fs.writeFileSync(outputPath, response.data);
    console.log(`✅ Imagen descargada: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`❌ Error al descargar imagen desde ${url}:`, error.message);
    throw error;
  }
}

async function generateCredential(row, index) {
  console.log(`\n🔄 Generando credencial ${index + 1}`);

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const $ = cheerio.load(svgContent, { xmlMode: true });
  $('svg').attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Mapeo de campos del Excel a IDs en el SVG
  const fieldMapping = {
    'text1': row.puesto,
    'text2': row.curp,
    'text3': row.telefono,
    'text4': row.tipo_sangre,
    'text5': row.alergia,
    'text6': row.fecha_expedicion,
    'text7': row.fecha_vigencia,
    'text8': row.familiar,
    'text9': row.parentesco,
    'text10': row.telefono_parentesco,
    'text11': row.nombre_elemento
  };

  // Insertar datos en el SVG
  for (const [fieldId, fieldValue] of Object.entries(fieldMapping)) {
    const tspan = $(`#${fieldId}`).find('tspan');
    if (tspan.length) {
      // Procesamiento especial para fechas
      if (fieldId === 'text6' || fieldId === 'text7') {
        const excelDate = parseFloat(fieldValue);
        if (!isNaN(excelDate)) {
          const date = XLSX.SSF.parse_date_code(excelDate);
          const formattedDate = `${date.d.toString().padStart(2, '0')}/${date.m.toString().padStart(2, '0')}/${date.y}`;
          tspan.text(formattedDate);
        } else {
          tspan.text(fieldValue);
        }
      } else {
        tspan.text(fieldValue);
      }
    } else {
      console.warn(`⚠️ No se encontró elemento con ID: ${fieldId}`);
    }
  }

  // Procesar imagen desde URL
  const imageUrl = row.url_imagen;
  if (!imageUrl) {
    console.warn('⚠️ No se proporcionó URL de imagen para esta credencial');
    return null;
  }

  try {
    // Descargar la imagen temporalmente
    const tempImagePath = path.join(outputDir, `temp_image_${index}.jpg`);
    await downloadImage(imageUrl, tempImagePath);
    
    // Convertir la imagen a base64
    const imageBase64 = fs.readFileSync(tempImagePath).toString('base64');
    const imageMimeType = 'image/jpeg'; // Asumimos que es JPEG, podrías detectar el tipo real

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

    // Eliminar la imagen temporal
    fs.unlinkSync(tempImagePath);

    const outputSvgPath = path.join(outputDir, `credencial_${index + 1}.svg`);
    const nuevoSvg = $.xml();
    fs.writeFileSync(outputSvgPath, nuevoSvg);
    console.log(`✅ SVG guardado: ${outputSvgPath}`);

    const outputPngPath = path.join(outputDir, `credencial_${index + 1}.png`);
    await sharp(Buffer.from(nuevoSvg))
      .png()
      .resize({ width: 1400, height: 1000 })
      .toFile(outputPngPath);
    console.log(`✅ PNG generado: ${outputPngPath}`);

    return outputPngPath;
  } catch (error) {
    console.error(`❌ Error al procesar imagen para credencial ${index + 1}:`, error);
    return null;
  }
}

async function createDocWithCredentials(pngPaths) {
  console.log('🟢 Creando documento Word con las credenciales...');

  // Filtrar paths nulos (credenciales fallidas)
  const validPaths = pngPaths.filter(path => path !== null);
  if (validPaths.length === 0) {
    console.error('❌ No hay credenciales válidas para generar el documento');
    return;
  }

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
          rows: Array.from({ length: Math.ceil(validPaths.length / 2) }, (_, rowIndex) => {
            const cells = [];

            if (validPaths[rowIndex * 2]) {
              const imageBuffer = fs.readFileSync(validPaths[rowIndex * 2]);
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

            if (validPaths[rowIndex * 2 + 1]) {
              const imageBuffer = fs.readFileSync(validPaths[rowIndex * 2 + 1]);
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
      if (pngPath) {
        pngPaths.push(pngPath);
      }
    }
    await createDocWithCredentials(pngPaths);
    console.log('✅ Proceso completado.');
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

main();