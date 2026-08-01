#!/usr/bin/env python3
"""Create an OpenTimestamps proof for an existing SHA-256 digest."""

import argparse
import logging
import os

import otsclient
from opentimestamps.core.op import OpAppend, OpSHA256
from opentimestamps.core.serialize import StreamSerializationContext
from opentimestamps.core.timestamp import DetachedTimestampFile, Timestamp, make_merkle_tree
from otsclient.cmds import create_timestamp


DEFAULT_CALENDARS = (
    "https://a.pool.opentimestamps.org",
    "https://b.pool.opentimestamps.org",
    "https://a.pool.eternitywall.com",
    "https://ots.btc.catallaxy.com",
)


def detached_timestamp(digest):
    proof = DetachedTimestampFile(OpSHA256(), Timestamp(digest))
    nonce_tip = proof.timestamp.ops.add(OpAppend(os.urandom(16)))
    merkle_root = make_merkle_tree([nonce_tip.ops.add(OpSHA256())])
    return proof, merkle_root


def configured_calendars():
    value = os.environ.get("OTS_CALENDAR_URLS", "")
    if not value.strip():
        return list(DEFAULT_CALENDARS)

    calendars = [url.strip() for url in value.split(",") if url.strip()]
    if not calendars or any(not url.startswith("https://") for url in calendars):
        raise ValueError("OTS_CALENDAR_URLS must contain comma-separated HTTPS URLs")
    return calendars


def stamp_digest(digest_hex, output_path):
    if len(digest_hex) != 64:
        raise ValueError("digest must be a 64-character SHA-256 hex string")

    try:
        digest = bytes.fromhex(digest_hex)
    except ValueError as error:
        raise ValueError("digest must be hexadecimal") from error

    calendars = configured_calendars()
    quorum = int(os.environ.get("OTS_CALENDAR_QUORUM", "2"))
    timeout = int(os.environ.get("OTS_CALENDAR_TIMEOUT_SECONDS", "10"))
    if quorum < 1 or quorum > len(calendars):
        raise ValueError("OTS_CALENDAR_QUORUM must be between 1 and the calendar count")
    if timeout < 1 or timeout > 120:
        raise ValueError("OTS_CALENDAR_TIMEOUT_SECONDS must be between 1 and 120")

    proof, merkle_root = detached_timestamp(digest)
    options = argparse.Namespace(
        m=quorum,
        timeout=timeout,
        use_btc_wallet=False,
        setup_bitcoin=None,
    )
    create_timestamp(merkle_root, calendars, options)

    with open(output_path, "xb") as output:
        proof.serialize(StreamSerializationContext(output))


def self_check():
    digest = bytes(32)
    proof, merkle_root = detached_timestamp(digest)
    if proof.file_digest != digest or len(merkle_root.msg) != 32:
        raise RuntimeError("OpenTimestamps digest initialization failed")
    print(f"opentimestamps-client {otsclient.__version__} digest support ready")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("digest", nargs="?")
    parser.add_argument("output", nargs="?")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(format="%(message)s", level=logging.INFO)
    if args.check:
        self_check()
        return
    if not args.digest or not args.output:
        parser.error("digest and output are required")
    stamp_digest(args.digest, args.output)


if __name__ == "__main__":
    main()
