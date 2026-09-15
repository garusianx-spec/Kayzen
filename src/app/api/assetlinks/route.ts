import { NextResponse } from 'next/server';

import { androidEnv } from '@/lib/env';

/**
 * Digital Asset Links, served at `/.well-known/assetlinks.json` by the rewrite
 * in `next.config.ts`.
 *
 * This file is the *entire* basis of the Trusted Web Activity's trust: Chrome
 * fetches it when the Android app launches and only removes the URL bar if it
 * finds the app's package name and its signing certificate's SHA-256
 * fingerprint here. Get it wrong and the app still works — it just looks like a
 * browser, which is the single most common way a TWA submission fails review.
 *
 * Two fingerprints are usually needed, and forgetting the second is the classic
 * mistake: the *upload* key signs what you send to Play, and Play App Signing
 * re-signs the artifact users install with a *different* key. Both belong in
 * `ANDROID_SHA256_CERT_FINGERPRINTS`.
 *
 *   keytool -list -v -keystore android/kayzen.keystore -alias kayzen
 *   # and Play Console → Setup → App integrity → App signing key certificate
 *
 * Generated from the environment rather than committed, so a fork or a staging
 * deployment with its own keystore needs no code change. A static
 * `public/.well-known/assetlinks.json` (see `npm run assetlinks:generate`)
 * takes precedence when present.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

export function GET(): NextResponse<AssetLinkStatement[]> {
  const { packageName, fingerprints } = androidEnv();

  const statements: AssetLinkStatement[] = [
    {
      relation: [
        // `handle_all_urls` is what lets the app open links to this origin;
        // `get_login_creds` lets Chrome share saved credentials with it.
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
