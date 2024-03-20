export function safeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, '');
}