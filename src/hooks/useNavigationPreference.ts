export type NavigationLayoutMode = "dock";

export function useNavigationPreference() {
  return {
    layoutMode: "dock" as const,
    setLayoutMode: (_mode?: string) => {},
    isSaving: false,
  };
}
