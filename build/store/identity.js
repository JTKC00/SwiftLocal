"use strict";

// Partner Center values are copied from build/store/partner-center-identity.json.
// packageFamilyName and storeId are verification records. They are not AppX Identity fields.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const record = Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, "partner-center-identity.json"), "utf8")));

function publisherId(publisher) {
  const hash = crypto.createHash("sha256").update(Buffer.from(publisher, "utf16le")).digest();
  let bits = "";
  for (let index = 0; index < 8; index += 1) bits += hash[index].toString(2).padStart(8, "0");
  bits += "0";
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) encoded += alphabet[Number.parseInt(bits.slice(index, index + 5), 2)];
  return encoded.toLowerCase();
}

function packageFamilyNameFrom(name, publisher) {
  return `${name}_${publisherId(publisher)}`;
}

function assertStorePackageVersion(version) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Store package version must have four numeric components: ${version}`);
  }
  const parts = version.split(".").map(Number);
  if (parts[0] === 0) throw new Error(`Store package version cannot start with 0: ${version}`);
  if (parts[3] !== 0) throw new Error(`Windows 10/11 Store package revision must be 0: ${version}`);
  if (parts.some(part => part > 65535)) throw new Error(`Store package version component exceeds 65535: ${version}`);
  return version;
}

const calculatedPackageFamilyName = packageFamilyNameFrom(record.identityName, record.publisher);
if (calculatedPackageFamilyName !== record.packageFamilyName) {
  throw new Error(`Calculated PFN ${calculatedPackageFamilyName} does not match reserved PFN ${record.packageFamilyName}`);
}
assertStorePackageVersion(record.packageVersion);

const productVersion = require("../../package.json").version;
if (productVersion !== record.productVersion) {
  throw new Error(`Product version ${productVersion} does not match the recorded Store mapping ${record.productVersion}`);
}

function artifactName(version = productVersion) {
  return `SwiftLocal-${version}-store-x64.appx`;
}

module.exports = {
  identityName: record.identityName,
  publisher: record.publisher,
  publisherDisplayName: record.publisherDisplayName,
  packageFamilyName: record.packageFamilyName,
  storeId: record.storeId,
  reservedProductName: record.reservedProductName,
  applicationId: record.applicationId,
  packageVersion: record.packageVersion,
  productVersion,
  profileDirectoryName: record.profileDirectoryName,
  outputDirectory: "dist-store",
  artifactName,
  publisherId,
  packageFamilyNameFrom,
  assertStorePackageVersion
};
