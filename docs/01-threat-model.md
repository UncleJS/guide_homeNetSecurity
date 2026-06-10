# 01 — Threat Model: Who Attacks Home Networks, and Why  🟢

Before you spend a minute hardening, understand what you're defending against. A home
network is **not** targeted by nation-states — but it is constantly probed by automated,
opportunistic attacks that don't care who you are. You are a number in a scan range.

## The realistic adversaries

| Adversary | Motivation | How they reach you |
|-----------|-----------|--------------------|
| **Botnet / worm** (Mirai-style) | Conscript IoT devices for DDoS, proxying, crypto | Scans the whole IPv4 internet for default creds & known CVEs |
| **Ransomware operator** | Extort money | Phishing → a foothold device → lateral movement to NAS/PCs |
| **Credential stuffer** | Account takeover | Reused passwords from breaches; exposed admin panels |
| **"Researcher"/scanner** | Census, resale of exposed hosts | Shodan/Censys-style mass scanning; finds your port-forwards |
| **Malicious insider / guest** | Snoop, free-ride, pivot | Your WiFi password; a device on your flat LAN |
| **Nosy neighbor** | Free internet, snooping | Weak WiFi (WEP/WPS/weak WPA2 passphrase) |
| **Compromised IoT vendor / app** | Supply-chain foothold | A camera/plug phoning home to a breached cloud |

The common thread: **opportunism and automation**. You don't have to be more secure than
everyone — just not the low-hanging fruit the scanners grab first.

## The home attack surface

```mermaid
graph TD
    NET["Internet<br/>(constant automated scanning)"]

    subgraph edge["Your perimeter"]
        WAN["ISP router / modem<br/>public IP"]
        FW["Firewall / NAT"]
        PF["Port forwards & UPnP<br/>(often opened silently)"]
    end

    subgraph lan["Your LAN (often flat & trusted)"]
        WIFI["WiFi<br/>(WPA2/WPA3, guest?)"]
        PC["PCs / laptops / phones"]
        NAS["NAS / file shares<br/>(your data)"]
        IOT["IoT: cameras, TVs,<br/>plugs, doorbells"]
        ADMIN["Router/AP admin panels"]
    end

    NET --> WAN --> FW
    FW --> PF
    PF -->|"exposes services"| NAS
    PF -->|"exposes services"| IOT
    NET -->|"phishing / drive-by"| PC
    WIFI --> PC
    WIFI --> IOT
    IOT -.->|"lateral movement<br/>on a flat network"| NAS
    IOT -.->|"lateral movement"| PC
    PC -.->|"reused creds"| ADMIN
```

Read the dotted lines carefully — they are the ones people forget:

- **A compromised IoT device pivots to your NAS** because everything is on one flat
  network with no segmentation. (Fixed in Chapter 05.)
- **UPnP silently opens port-forwards** so a device exposes itself to the internet
  without you knowing. (Fixed in Chapter 04/07.)
- **Reused credentials** let a phished laptop unlock the router admin panel.
  (Fixed in Chapters 04/09.)

## The three failure modes that cause most home compromises

1. **Default / weak credentials** — router admin, IoT devices, NAS accounts.
2. **Exposed services** — port-forwards, UPnP, IoT cloud, admin panels reachable from
   the WAN or from an untrusted segment.
3. **Flat networks** — one big LAN where a single compromised device can reach
   everything else.

Almost everything in this guide maps back to closing one of these three.

## Your job: write down *your* threat model

You don't need a formal document. Answer three questions and store the answers
(NetInventory's notes are a fine place):

- **What would hurt most if it were stolen or encrypted?** (Photos? Documents? The NAS?)
- **What's the most exposed thing I run?** (A port-forward? A smart camera? Remote desktop?)
- **Who uses my network that I don't fully control?** (Kids, guests, roommates, IoT.)

> **Record it:** Create a `reference` note in NetInventory titled "Threat model" with your
> three answers. Re-read it whenever you add a new device or service.

➡️ Next: [02 — Network fundamentals](02-fundamentals.md)
