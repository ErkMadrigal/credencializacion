const xlsx = require('xlsx');
const fs = require('fs');

const inputFile = process.argv[2];
const workbook = xlsx.readFile(inputFile);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);

console.log("Datos procesados del script 1:");
console.log(data);
