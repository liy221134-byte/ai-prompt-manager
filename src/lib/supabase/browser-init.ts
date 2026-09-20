export type BrowserClientInitialization<TClient> = {
  client: TClient | null;
  errorMessage: string | null;
  isLoading: false;
};

export function getBrowserClientInitialization<TClient>(
  createClient: () => TClient,
): BrowserClientInitialization<TClient> {
  try {
    return {
      client: createClient(),
      errorMessage: null,
      isLoading: false,
    };
  } catch (error) {
    return {
      client: null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Supabase 登录服务无法启动。",
      isLoading: false,
    };
  }
}
