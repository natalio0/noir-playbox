import crypto from "node:crypto";

/*
 * Cetak secret baru ke terminal.
 * Script tidak menyimpan secret ke file.
 */
const secret =
  crypto.randomBytes(48).toString("hex");

console.log(secret);
