/**
 * Meta Embedded Signup — loads the Facebook JS SDK and drives the WhatsApp
 * Business Account connection popup (FB.login with a Signup Configuration).
 */

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string, graphApiVersion = 'v21.0'): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: graphApiVersion,
      });
      resolve();
    };

    if (document.getElementById('facebook-jssdk')) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'));
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
}

/**
 * Launches the Embedded Signup popup. Meta sends WABA/phone selection details via
 * postMessage as the user completes the flow inside the popup, and FB.login's own
 * callback separately returns the authorization `code` once the popup closes.
 */
export function launchEmbeddedSignup(configId: string): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK not loaded'));
      return;
    }

    let sessionData: { wabaId?: string; phoneNumberId?: string; businessId?: string } = {};

    const messageHandler = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
          sessionData = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
            businessId: data.data?.business_id,
          };
        } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
          window.removeEventListener('message', messageHandler);
          reject(new Error(data.data?.error_message || 'WhatsApp connection was cancelled'));
        }
      } catch {
        // Not a JSON postMessage we care about — ignore.
      }
    };

    window.addEventListener('message', messageHandler);

    window.FB.login(
      (response: any) => {
        window.removeEventListener('message', messageHandler);

        const code = response?.authResponse?.code;
        if (!code || !sessionData.wabaId || !sessionData.phoneNumberId) {
          reject(new Error('WhatsApp connection did not complete — no phone number was selected'));
          return;
        }

        resolve({
          code,
          wabaId: sessionData.wabaId,
          phoneNumberId: sessionData.phoneNumberId,
          businessId: sessionData.businessId,
        });
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        // Matches what Meta's own Embedded Signup builder generates for this
        // configuration — v4 of the flow, session info v3. Omitting the version
        // leaves Meta to pick a default that may not match the config.
        extras: { sessionInfoVersion: '3', version: 'v4' },
      }
    );
  });
}
