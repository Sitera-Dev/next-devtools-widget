export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNextDevTools } = await import('next-devtools-widget/server');
    registerNextDevTools();
  }
}
