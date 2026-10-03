"""Phase 2D only: repackage frozen 1.0.0.0 with Identity Version 1.0.1.0.

No product build, signing, installation, identity override or release operation.
Run explicitly with --makeappx pointing to Microsoft Windows SDK MakeAppx.
The normal pack:win:store command and first-submission identity stay unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
FROZEN_SHA = "38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404"
FROZEN_BYTES = 1115695293
NAME = "JTKC.SwiftLocal"
PUBLISHER = "CN=48CB75C0-3F50-44EF-87EB-8203F196B957"
NS = {"p": "http://schemas.microsoft.com/appx/manifest/foundation/windows10"}
GENERATED = {"AppxBlockMap.xml", "[Content_Types].xml"}


def digest(stream):
    h = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
    return h.hexdigest()


def file_hash(file):
    with file.open("rb") as stream:
        return digest(stream)


def identity(manifest, version):
    root = ET.fromstring(manifest)
    item = root.find("p:Identity", NS)
    assert item is not None
    assert item.attrib == {"Name": NAME, "Publisher": PUBLISHER,
                           "Version": version, "ProcessorArchitecture": "x64"}, item.attrib
    assert root.find("p:Applications/p:Application", NS).get("Id") == "SwiftLocal"
    assert root.find("p:Properties/p:PublisherDisplayName", NS).text == "JTKC"
    assert root.find("p:Properties/p:Description", NS).text == "SwiftLocal 0.4.1"
    return item.attrib


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--makeappx", type=Path, required=True)
    args = parser.parse_args()
    baseline = ROOT / "dist-store/SwiftLocal-0.4.1-store-x64.appx"
    evidence = ROOT / "store-evidence/phase2d"
    scratch = evidence / "update-fixture-payload"
    output = evidence / "SwiftLocal-0.4.1-store-update-fixture-1.0.1.0-x64.appx"
    assert baseline.stat().st_size == FROZEN_BYTES, "Frozen baseline byte size changed"
    assert file_hash(baseline) == FROZEN_SHA, "Frozen baseline SHA changed; stop"
    assert args.makeappx.is_file(), "Microsoft SDK MakeAppx missing"
    assert not scratch.exists() and not output.exists(), "Refusing to overwrite a prior fixture"
    evidence.mkdir(parents=True, exist_ok=True)
    scratch.mkdir()
    with zipfile.ZipFile(baseline) as original:
        assert "AppxSignature.p7x" not in original.namelist(), "Baseline must be unsigned"
        old_manifest = original.read("AppxManifest.xml")
        identity(old_manifest, "1.0.0.0")
        # Replace only the version attribute inside the one Identity element.
        changed, count = re.subn(rb'(<Identity\b[^>]*\bVersion=")1\.0\.0\.0(")',
                                 rb'\g<1>1.0.1.0\2', old_manifest)
        assert count == 1, "Manifest does not have one expected Identity version"
        identity(changed, "1.0.1.0")
        for info in original.infolist():
            if info.filename in GENERATED or info.is_dir():
                continue
            # AppX ZIP entry names are URI-escaped. MakeAppx expects decoded
            # filesystem paths, otherwise @ and + are escaped a second time.
            target = (scratch / unquote(info.filename)).resolve()
            assert target.is_relative_to(scratch.resolve()), "Package entry escapes scratch"
            target.parent.mkdir(parents=True, exist_ok=True)
            with original.open(info) as source, target.open("wb") as dest:
                while chunk := source.read(1024 * 1024):
                    dest.write(chunk)
        (scratch / "AppxManifest.xml").write_bytes(changed)
    with (evidence / "makeappx-update-fixture.log").open("wb") as log:
        packed = subprocess.run([str(args.makeappx.resolve()), "pack", "/d", str(scratch),
                                 "/p", str(output)], stdout=log, stderr=subprocess.STDOUT)
    assert packed.returncode == 0, "MakeAppx rejected fixture; preserve log and stop"
    entries = []
    with zipfile.ZipFile(baseline) as original, zipfile.ZipFile(output) as update:
        assert "AppxSignature.p7x" not in update.namelist()
        assert set(original.namelist()) == set(update.namelist()), "Package entries changed"
        assert update.read("AppxManifest.xml") == changed
        for name in original.namelist():
            if name in GENERATED or name == "AppxManifest.xml":
                continue
            with original.open(name) as a, update.open(name) as b:
                before, after = digest(a), digest(b)
            assert before == after, f"Unexpected payload change: {name}"
            entries.append({"path": name, "bytes": original.getinfo(name).file_size, "sha256": before})
    assert file_hash(baseline) == FROZEN_SHA, "Frozen baseline changed during fixture creation"
    report = {
        "status": "PASS", "scope": "unsigned package fixture verification, not consumer acceptance",
        "productVersion": "0.4.1", "firstSubmissionVersion": "1.0.0.0",
        "baseline": {"filename": baseline.name, "bytes": FROZEN_BYTES, "sha256": FROZEN_SHA},
        "update": {"filename": output.name, "bytes": output.stat().st_size,
                   "sha256": file_hash(output), "identity": identity(changed, "1.0.1.0")},
        "packageFamilyName": "JTKC.SwiftLocal_j44a9ewx73faj", "applicationId": "SwiftLocal",
        "identicalPayloadEntries": len(entries),
        "intentionalDifferences": ["AppxManifest.xml: Identity Version 1.0.0.0 -> 1.0.1.0",
                                   "MakeAppx regenerated block map, content types and ZIP encoding"],
        "embeddedPartnerCenterIdentity": "unchanged: intended first submission remains 1.0.0.0",
        "makeappxSha256": file_hash(args.makeappx),
        "sourceWorkflowRun": "https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387",
        "sourceBuildCommit": "5b0e2c2eb9150c2142a1057b61c4675832a61878",
        "phase2bEvidenceCommit": "1c577b7", "phase2dStartingHead": "ad557eed10af198dc2a69156417773d7cf63a5a1",
        "signing": "UNVERIFIED", "installation": "UNVERIFIED", "storeSubmission": "not run"
    }
    (evidence / "update-fixture-payload-hashes.json").write_text(json.dumps(entries, indent=2), encoding="utf-8")
    (evidence / "update-fixture.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    public = ROOT / "docs/acceptance/2026-09-30-store-phase2d"
    (public / "baseline-AppxManifest.xml").write_bytes(old_manifest)
    (public / "update-AppxManifest.xml").write_bytes(changed)
    (public / "update-fixture.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
