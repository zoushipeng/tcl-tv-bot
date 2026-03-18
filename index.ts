import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { tclTvBotPlugin } from "./src/channel.js";

const plugin = {
  id: "tcl-tv-bot",
  name: "TCL TV Bot",
  description: "TCL TV Bot channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: tclTvBotPlugin });
  },
};

export default plugin;
export { tclTvBotPlugin } from "./src/channel.js";
