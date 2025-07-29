const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const port = 3000;

// Configuración de CORS
app.use(cors());

// Configuración para servir archivos estáticos
app.use(express.static('public'));

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Crear directorios necesarios
const requiredDirs = ['uploads', 'output', path.join('plantillas')];
requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Verificar archivos necesarios
const requiredFiles = {
  svgTemplate: path.join(__dirname, 'plantillas', 'Credenciales_Laumir.svg'),
  defaultPhoto: path.join(__dirname, 'foto.png')
};

// Crear archivos por defecto si no existen
if (!fs.existsSync(requiredFiles.svgTemplate)) {
  fs.writeFileSync(requiredFiles.svgTemplate, '<svg></svg>');
  console.warn(`⚠️ Se creó un archivo SVG vacío en ${requiredFiles.svgTemplate}. Por favor reemplázalo con tu plantilla real.`);
}

if (!fs.existsSync(requiredFiles.defaultPhoto)) {
  // Puedes crear una imagen PNG vacía si quieres
  console.warn(`⚠️ No se encontró foto.png. Necesitas colocar una imagen por defecto para las credenciales.`);
}

// Ruta para subir archivo XLSX
app.post('/upload', upload.single('xlsxFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No se subió ningún archivo');
  }

  const scriptType = req.body.scriptType || 'lauimir'; // Default a laumir si no se especifica
  const inputPath = path.join(__dirname, 'uploads', req.file.filename);
  const outputDocxPath = path.join(__dirname, 'output', `credenciales_${scriptType}.docx`);

  // Ejecutar tu script lauimir.js exactamente como está
  exec(`node ${scriptType}.js "${inputPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).send('Error al procesar el archivo');
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }

    console.log(stdout); // Mostrar logs de tu script

    // Verificar si el archivo se generó (tu script lo guarda en ../output/credenciales_nuevo4.docx)
    const generatedDocxPath = path.join(__dirname, 'output', 'credenciales_generadas.docx');
    
    if (fs.existsSync(generatedDocxPath)) {
      // Enviar el archivo generado para descarga
      res.download(generatedDocxPath, 'credenciales.docx', (err) => {
        if (err) {
          console.error('Error al descargar:', err);
          res.status(500).send('Error al descargar el archivo');
        }
        
        // Opcional: Limpiar archivos temporales después de 5 segundos
        setTimeout(() => {
          fs.unlink(inputPath, () => {});
          fs.unlink(generatedDocxPath, () => {});
          // Limpiar archivos PNG y SVG temporales
          const tempFiles = fs.readdirSync(path.join(__dirname, 'output'))
            .filter(file => file.match(/credencial_\d+\.(svg|png)/));
          tempFiles.forEach(file => {
            fs.unlink(path.join(__dirname, 'output', file), () => {});
          });
        }, 5000);
      });
    } else {
      // Mensaje de error más detallado
      const outputContents = fs.readdirSync(path.join(__dirname, 'output'));
      console.error('Contenido del directorio output:', outputContents);
      res.status(500).send(`El archivo DOCX no se generó correctamente. Buscado: ${generatedDocxPath}`);
    }
  });
});

// Ruta para descargar archivos necesarios (opcional)
app.get('/download-template', (req, res) => {
  res.download(requiredFiles.svgTemplate, 'Credenciales_Laumir.svg');
});

app.get('/download-photo', (req, res) => {
  if (fs.existsSync(requiredFiles.defaultPhoto)) {
    res.download(requiredFiles.defaultPhoto, 'foto.png');
  } else {
    res.status(404).send('Archivo no encontrado');
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
  
});