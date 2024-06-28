import * as http from "http";
import * as net from "net";
import { AddressInfo } from "net";
import * as vscode from "vscode";
import { getRemoteSafeUrl } from "./extension-api-utils/getRemoteSafeUrl";
import { retryUntilTimeout } from "./retry-utils";
import { getExtensionHostPreview } from "./extension-api-utils/extensionHostPreview";

/**
 * Tests if a port is open on a host, by trying to connect to it with a TCP
 * socket.
 */
async function isPortOpen(
  host: string,
  port: number,
  timeout: number = 1000
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const client = new net.Socket();

    client.setTimeout(timeout);
    client.connect(port, host, function () {
      resolve(true);
      client.end();
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("Timed out"));
    });

    client.on("error", (err) => {
      reject(err);
    });

    client.on("close", () => {
      reject(new Error("Connection closed"));
    });
  });
}

/**
 * Opens a browser for the specified port, once that port is open. Handles
 * translating http://localhost:<port> into a proxy URL, if necessary.
 * @param port The port to open the browser for.
 * @param additionalPorts Additional ports to wait for before opening the
 * browser.
 */
export async function openBrowserWhenReady(
  port: number,
  ...additionalPorts: number[]
): Promise<void> {
  const portsOpen = [port, ...additionalPorts].map((p) =>
    retryUntilTimeout(60000, () => isPortOpen("127.0.0.1", p))
  );
  const portsOpenResult = await Promise.all(portsOpen);
  if (portsOpenResult.filter((p) => !p).length > 0) {
    console.warn("Failed to connect to Shiny app, not launching browser");
    return;
  }

  let previewUrl = await getRemoteSafeUrl(port);
  await openBrowser(previewUrl);
}

export async function openBrowser(url: string): Promise<void> {
  const previewType = vscode.workspace
    .getConfiguration()
    .get("shiny.previewType");

  switch (previewType) {
    case "none":
      return;
    case "external": {
      if (url === "about:blank") {
        // don't need to open a blank page in external browser
        return;
      }
      vscode.env.openExternal(vscode.Uri.parse(url));
      return;
    }
    // @ts-ignore-next-line
    case "internal": {
      const hostPreview = getExtensionHostPreview();
      if (hostPreview) {
        hostPreview(url);
        return;
      }
      // fallthrough to simpleBrowser default if no hostPreview feature
    }
    default: {
      await vscode.commands.executeCommand("simpleBrowser.api.open", url, {
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.Beside,
      });
    }
  }
}

export async function suggestPort(): Promise<number> {
  do {
    const server = http.createServer();

    const p = new Promise<number>((resolve, reject) => {
      server.on("listening", () =>
        resolve((server.address() as AddressInfo).port)
      );
      server.on("error", reject);
    }).finally(() => {
      return closeServer(server);
    });

    server.listen(0, "127.0.0.1");

    const port = await p;

    if (!UNSAFE_PORTS.includes(port)) {
      return port;
    }
  } while (true);
}

async function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((errClose) => {
      if (errClose) {
        // Don't bother logging, we don't care (e.g. if the server
        // failed to listen, close() will fail)
      }
      // Whether close succeeded or not, we're now ready to continue
      resolve();
    });
  });
}

// Ports that are considered unsafe by Chrome
// http://superuser.com/questions/188058/which-ports-are-considered-unsafe-on-chrome
// https://github.com/rstudio/shiny/issues/1784
const UNSAFE_PORTS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
];
