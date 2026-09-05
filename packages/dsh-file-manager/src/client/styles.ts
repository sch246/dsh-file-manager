/** Scoped browser styles for the file-manager tree. */
export const FILE_MANAGER_CSS = `
.dsh-file-manager-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsh-fg,currentColor);font:13px/1.4 system-ui,sans-serif}
.dsh-file-manager-address{display:flex;gap:6px;padding:8px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
.dsh-file-manager-address label{display:flex;align-items:center;gap:6px;min-width:0;flex:1}.dsh-file-manager-address input{min-width:0;flex:1;padding:5px 7px}
.dsh-file-manager-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.dsh-file-manager-toolbar label{display:flex;align-items:center;gap:4px;margin-inline-start:auto}
.dsh-file-manager-tree{overflow:auto;min-height:0;flex:1;padding-block:4px}.dsh-file-manager-entry{display:flex;align-items:center;gap:3px;min-height:29px;padding-inline-end:5px}
.dsh-file-manager-entry:hover,.dsh-file-manager-entry[data-selected=true]{background:color-mix(in srgb,currentColor 8%,transparent)}
.dsh-file-manager-expand{width:24px;min-width:24px;border:0;background:transparent;color:inherit}.dsh-file-manager-name{display:flex;align-items:center;gap:6px;min-width:0;flex:1;border:0;background:transparent;color:inherit;text-align:start}.dsh-file-manager-name span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-file-manager-row-action{visibility:hidden;font-size:11px}.dsh-file-manager-entry:hover .dsh-file-manager-row-action,.dsh-file-manager-row-action:focus{visibility:visible}.dsh-file-manager-row-action.is-danger{color:#b42318}
.dsh-file-manager-state{padding:16px;color:color-mix(in srgb,currentColor 65%,transparent)}.dsh-file-manager-error{display:flex;gap:8px;align-items:flex-start;padding:8px;background:#fef3f2;color:#b42318}.dsh-file-manager-error span{flex:1;overflow-wrap:anywhere}.dsh-file-manager-parent{display:block;width:100%;padding:5px 12px;border:0;background:transparent;color:inherit;text-align:start}
button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.55}
`
