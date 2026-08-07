import { ConfigRail } from "@/components/config-rail";

/**
 * Every Configuration screen shares one frame: the section navigator on the left,
 * the section itself on the right. The page head belongs to the section, not to
 * this frame, so each screen states its own purpose and actions.
 */
export default function ConfigurationLayout({ children }: LayoutProps<"/configuration">) {
  return (
    <div className="cfg-wrap">
      <ConfigRail />
      <div className="cfg-main">{children}</div>
    </div>
  );
}
