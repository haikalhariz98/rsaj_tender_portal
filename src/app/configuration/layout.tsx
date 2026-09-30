/**
 * Every Configuration screen shares one frame. The section navigator is the sidebar
 * itself — it switches to Configuration's sections while you are in here — so this
 * frame adds nothing but a width that suits forms and registers. The page head
 * belongs to the section, so each screen states its own purpose and actions.
 */
export default function ConfigurationLayout({ children }: LayoutProps<"/configuration">) {
  return <div className="min-w-0">{children}</div>;
}
