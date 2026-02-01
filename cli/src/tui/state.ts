// TUI state - separate file to avoid circular import issues
export const tuiState = {
	active: false,
	exitResolver: null as (() => void) | null,
	dispose: null as (() => void) | null,
};
