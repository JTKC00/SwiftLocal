"""Read-only comparison of both signed Phase 2D copies to their unsigned inputs."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "store-evidence/phase2d"
GENERATED = {"AppxBlockMap.xml", "[Content_Types].xml", "AppxMetadata/CodeIntegrity.cat", "AppxSignature.p7x"}


def digest(stream):
    value = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        value.update(chunk)
    return value.hexdigest()


def main():
    prepared = json.loads((EVIDENCE / "signing/signing.json").read_text(encoding="utf-8-sig"))
    packages = []
    for package in prepared["packages"]:
        unsigned, signed = Path(package["unsignedPath"]), Path(package["signedPath"])
        with unsigned.open("rb") as stream:
            assert digest(stream) == package["unsignedSha256"], "Unsigned input changed"
        with signed.open("rb") as stream:
            assert digest(stream) == package["signedSha256"], "Signed copy changed"
        checked = 0
        with zipfile.ZipFile(unsigned) as source, zipfile.ZipFile(signed) as target:
            assert "AppxSignature.p7x" not in source.namelist()
            assert "AppxSignature.p7x" in target.namelist()
            assert set(source.namelist()) - GENERATED == set(target.namelist()) - GENERATED
            for name in source.namelist():
                if name in GENERATED:
                    continue
                with source.open(name) as a, target.open(name) as b:
                    assert digest(a) == digest(b), f"Signed payload changed: {name}"
                checked += 1
            packages.append({"version": package["version"], "unsignedSha256": package["unsignedSha256"],
                             "signedSha256": package["signedSha256"], "unsignedBytes": package["unsignedBytes"],
                             "signedBytes": package["signedBytes"], "identicalOriginalEntriesIncludingManifest": checked,
                             "addedSigningMetadata": sorted(set(target.namelist()) - set(source.namelist()))})
    report = {"status": "PASS", "scope": "both developer-signed payloads match verified unsigned inputs; trust/GUI separate",
              "packages": packages, "certificateThumbprint": prepared["certificateThumbprint"],
              "certificateSubject": prepared["certificateSubject"], "sameCertificate": True,
              "privateKeyExport": "not performed", "trust": prepared["trust"], "guiAcceptance": "UNVERIFIED"}
    output = ROOT / "docs/acceptance/2026-09-30-store-phase2d/signed-payload-verification.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
