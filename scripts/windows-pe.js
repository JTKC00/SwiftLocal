"use strict";

const fs = require("node:fs");

const DOS_HEADER_BYTES = 64;
const PE_COFF_HEADER_BYTES = 24;
const PE_POINTER_OFFSET = 0x3c;
const IMAGE_FILE_MACHINE_I386 = 0x014c;
const IMAGE_FILE_MACHINE_AMD64 = 0x8664;
const IMAGE_FILE_EXECUTABLE_IMAGE = 0x0002;
const OPTIONAL_HEADER_MAGIC_PE32 = 0x010b;
const OPTIONAL_HEADER_MAGIC_PE32_PLUS = 0x020b;
const OPTIONAL_HEADER_BYTES_PE32 = 224;
const OPTIONAL_HEADER_BYTES_PE32_PLUS = 240;
const SECTION_HEADER_BYTES = 40;

/**
 * Read the minimum headers needed to prove that a file is a Windows PE image.
 * This validates structure only; it deliberately does not execute the binary.
 */
function readWindowsPe(filePath, minimumBytes = 1, allowedMachines = [IMAGE_FILE_MACHINE_I386, IMAGE_FILE_MACHINE_AMD64]) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < minimumBytes) {
    throw new Error(`file is smaller than ${minimumBytes} bytes (${stat.size} bytes)`);
  }
  if (stat.size < DOS_HEADER_BYTES) {
    throw new Error(`file is too small for a DOS header (${stat.size} bytes)`);
  }

  const handle = fs.openSync(filePath, "r");
  try {
    const dosHeader = Buffer.alloc(DOS_HEADER_BYTES);
    if (fs.readSync(handle, dosHeader, 0, dosHeader.length, 0) !== dosHeader.length) {
      throw new Error("could not read the complete DOS header");
    }
    if (dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      throw new Error("DOS MZ signature is missing");
    }

    const peOffset = dosHeader.readUInt32LE(PE_POINTER_OFFSET);
    if (peOffset < DOS_HEADER_BYTES || peOffset > stat.size - PE_COFF_HEADER_BYTES) {
      throw new Error(`e_lfanew points outside the file (${peOffset})`);
    }

    const peHeader = Buffer.alloc(PE_COFF_HEADER_BYTES);
    if (fs.readSync(handle, peHeader, 0, peHeader.length, peOffset) !== peHeader.length) {
      throw new Error("could not read the complete PE signature and COFF header");
    }
    if (!peHeader.subarray(0, 4).equals(Buffer.from([0x50, 0x45, 0x00, 0x00]))) {
      throw new Error("PE\\0\\0 signature is missing");
    }

    const machine = peHeader.readUInt16LE(4);
    if (!allowedMachines.includes(machine)) {
      const expected = allowedMachines.map((value) => `0x${value.toString(16).padStart(4, "0")}`).join(" / ");
      throw new Error(`PE machine is 0x${machine.toString(16).padStart(4, "0")}, expected ${expected}`);
    }
    const numberOfSections = peHeader.readUInt16LE(6);
    const sizeOfOptionalHeader = peHeader.readUInt16LE(20);
    const characteristics = peHeader.readUInt16LE(22);
    if (numberOfSections < 1 || numberOfSections > 96) {
      throw new Error(`PE COFF header has an invalid section count (${numberOfSections})`);
    }
    if (!(characteristics & IMAGE_FILE_EXECUTABLE_IMAGE)) {
      throw new Error("PE COFF header is not marked executable");
    }
    const optionalHeaderOffset = peOffset + PE_COFF_HEADER_BYTES;
    const minimumOptionalHeader = machine === IMAGE_FILE_MACHINE_AMD64
      ? OPTIONAL_HEADER_BYTES_PE32_PLUS
      : OPTIONAL_HEADER_BYTES_PE32;
    if (sizeOfOptionalHeader < minimumOptionalHeader || optionalHeaderOffset > stat.size - sizeOfOptionalHeader) {
      throw new Error(`PE optional header points outside the file (${sizeOfOptionalHeader} bytes)`);
    }
    const optionalMagic = Buffer.alloc(2);
    if (fs.readSync(handle, optionalMagic, 0, optionalMagic.length, optionalHeaderOffset) !== optionalMagic.length) {
      throw new Error("could not read the PE optional-header magic");
    }
    const magic = optionalMagic.readUInt16LE(0);
    const expectedMagic = machine === IMAGE_FILE_MACHINE_AMD64
      ? OPTIONAL_HEADER_MAGIC_PE32_PLUS
      : OPTIONAL_HEADER_MAGIC_PE32;
    if (magic !== expectedMagic) {
      throw new Error(
        `PE optional-header magic is 0x${magic.toString(16).padStart(4, "0")}, expected 0x${expectedMagic.toString(16)}`
      );
    }
    const sectionTableOffset = optionalHeaderOffset + sizeOfOptionalHeader;
    const sectionTableBytes = numberOfSections * SECTION_HEADER_BYTES;
    if (sectionTableOffset > stat.size - sectionTableBytes) {
      throw new Error("PE section table points outside the file");
    }
    const sections = Buffer.alloc(sectionTableBytes);
    if (fs.readSync(handle, sections, 0, sections.length, sectionTableOffset) !== sections.length) {
      throw new Error("could not read the complete PE section table");
    }
    let hasRawSection = false;
    for (let index = 0; index < numberOfSections; index += 1) {
      const offset = index * SECTION_HEADER_BYTES;
      const sizeOfRawData = sections.readUInt32LE(offset + 16);
      const pointerToRawData = sections.readUInt32LE(offset + 20);
      if (!sizeOfRawData) continue;
      hasRawSection = true;
      if (!pointerToRawData || pointerToRawData > stat.size - sizeOfRawData) {
        throw new Error(`PE section ${index + 1} raw data points outside the file`);
      }
    }
    if (!hasRawSection) {
      throw new Error("PE image has no section with raw data");
    }
    return { stat, peOffset, machine, numberOfSections, sizeOfOptionalHeader, magic };
  } finally {
    fs.closeSync(handle);
  }
}

function readWindowsX64Pe(filePath, minimumBytes = 1) {
  return readWindowsPe(filePath, minimumBytes, [IMAGE_FILE_MACHINE_AMD64]);
}

function isWindowsX64Pe(filePath, minimumBytes = 1) {
  try {
    readWindowsX64Pe(filePath, minimumBytes);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  IMAGE_FILE_MACHINE_I386,
  IMAGE_FILE_MACHINE_AMD64,
  isWindowsX64Pe,
  readWindowsPe,
  readWindowsX64Pe
};
