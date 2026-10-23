'use server';

import { trackServerAction } from 'next-devtools-widget/server';

export const claim = trackServerAction('claim', async (voucherId: string) => {
  await new Promise((r) => setTimeout(r, 80));
  if (voucherId === 'bad') throw new Error('Voucher sold out');
  return { claimed: voucherId, at: Date.now() };
});

export const claimWithFetch = trackServerAction(
  'claimWithFetch',
  async (voucherId: string) => {
    // Server action invoking an internal/external API fetch
    const response = await fetch('http://localhost:3100/api/demo?status=200', {
      method: 'GET',
      headers: {
        'x-triggered-by': 'server-action',
        'x-voucher-id': voucherId,
      },
    });

    if (!response.ok) {
      throw new Error(`API call inside Server Action failed: ${response.status}`);
    }

    const apiData = await response.json();
    return {
      success: true,
      voucherId,
      apiData,
      source: 'server-action-with-fetch',
      timestamp: Date.now(),
    };
  },
);

export const checkoutWithPostApi = trackServerAction(
  'checkoutWithPostApi',
  async (voucherId: string, amount: number) => {
    // Server action performing a POST request with payload
    const response = await fetch('http://localhost:3100/api/demo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer server-action-internal-secret',
      },
      body: JSON.stringify({
        orderId: `ord_${Date.now()}`,
        voucherId,
        amount,
        internalNote: 'Processed via Server Action',
      }),
    });

    const result = await response.json();
    return {
      status: response.status,
      result,
    };
  },
);
