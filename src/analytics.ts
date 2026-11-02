import { PHONE } from './game/state';

// PostHog, loaded after the game so it never slows the first paint. The events
// answer: who plays vs. reads, how far they get, what they find, and whether
// they reach out. The project key is public by design (it can only send events).
//
// Nothing is sent from the dev server or automated test runs. Open the site once
// with ?notrack to exclude that browser for good (?track undoes it).

const KEY = 'phc_pjhHD6U8uAFZiHYJHd7gRdSrrNnAYmGwdKVJ4Y75z924';
const OPT_OUT = 'smb3.notrack';

type Props = Record<string, string | number | boolean | undefined>;
type Client = { capture(e: string, p?: Props): void; register(p: Props): void };

let client: Client | undefined;
let off = false;
const queue: ((c: Client) => void)[] = [];

function run(fn: (c: Client) => void) {
  if (off) return;
  if (client) fn(client);
  else queue.push(fn);
}

export function track(event: string, props?: Props) {
  run((c) => c.capture(event, props));
}

/** Attached to every later event: where the visitor is, so a session's last events say where they left. */
export function setContext(props: Props) {
  run((c) => c.register(props));
}

function optedOut() {
  const q = new URLSearchParams(location.search);
  try {
    if (q.has('notrack')) localStorage.setItem(OPT_OUT, '1');
    if (q.has('track')) localStorage.removeItem(OPT_OUT);
    if (localStorage.getItem(OPT_OUT)) return true;
  } catch {}
  return import.meta.env.DEV || q.has('timer') || navigator.webdriver;
}

export async function initAnalytics() {
  off = optedOut();
  if (off) return void (queue.length = 0);
  // outbound links and the resume download, wherever they are on the page
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[href]');
      if (!a) return;
      const href = a.getAttribute('href')!;
      if (a.hasAttribute('download')) track('resume_downloaded');
      else if (href.startsWith('mailto:')) track('contact_clicked', { channel: 'email' });
      else if (href.includes('linkedin.com')) track('contact_clicked', { channel: 'linkedin' });
      else if (/^https?:/.test(href)) track('link_clicked', { url: href, label: a.textContent?.trim() });
    },
    true,
  );
  const { default: posthog } = await import('posthog-js');
  posthog.init(KEY, {
    api_host: 'https://us.i.posthog.com',
    defaults: '2025-05-24',
    person_profiles: 'identified_only',
    persistence: 'localStorage',
    // a canvas game: named events say far more than clicks on a <canvas>
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_pageview: true,
    capture_pageleave: true,
  });
  posthog.register({ device: PHONE ? 'phone' : 'desktop' });
  client = posthog as unknown as Client;
  queue.splice(0).forEach((fn) => fn(client!));
}
