## Room

Following NIP-53 using `kind: 30312`

`service` tag is added to point clients to the API which controls the room access

```json
{
  "kind": 30312,
  "tags": [
    ["d", "<unique identifier>"],
    ["title", "<name of the event>"],
    ["summary", "<description>"],
    ["image", "<preview image url>"],
    ["t", "hashtag"],
    ["streaming", "<url>"],
    ["recording", "<url>"], // used to place the edited video once the activity is over
    ["starts", "<unix timestamp in seconds>"],
    ["ends", "<unix timestamp in seconds>"],
    ["status", "<planned, live, ended>"],
    ["current_participants", "<number>"],
    ["total_participants", "<number>"],
    ["p", "aaaa", "wss://provider1.com/", "host"],
    ["p", "bbbb", "wss://provider2.com/nostr", "speaker"],
    ["p", "cccc", "wss://provider3.com/nostr", "speaker"],
    ["p", "dddd", "wss://provider4.com/nostr", "speaker"],
    ["relays", "wss://one.com", "wss://two.com", ...],
    ["service", "https://nostrnests.com/api/v1/nests"],
  ],
  "content": "",
  ...
}
```

In order to make it more obvious the type of streaming backend being used the url should be one of the following:
- `wss+livekit://example.com` - LiveKit websocket.
- `https://example.com/live.m3u8` - HLS playlist.

If the room is a LiveKit room clients should auth with the `service` tag using NIP-98 auth at `<service-url>/auth` 
to obtain an access token.

Other systems can be supported in the future by defining different streaming url formats.

## Room Chat

Sames as NIP-53 `kind: 1311`, there is no reason to have another kind here as they always have `a` tag.

```json
{
  "kind": 1311,
  "tags": [
    ["a", "30311:<Community event author pubkey>:<d-identifier of the community>", "<Optional relay url>", "root"],
  ],
  "content": "Zaps to live streams is beautiful.",
  ...
}
```

## Room Presence

New `kind: 10312` provides an event which signals presence of a listener. 
An `expiration` tag SHOULD be used to allow the natural cleanup of these events.

**This kind `10312` is a regular replaceable event, as such presence can only be indicated in one room at a time.**

```json
{
  "kind": 10312,
  "tags": [
    ["a" , "<room-a-tag>", "<relay-hint>", "root"],
    ["expiration", "<unix-timestamp>"]
  ]
}
```

## ZapSplits

Zap splits should be set on the room `kind: 30312` as NIP-57.G `zap` tags

## Testing
Start by bringing up the dev env:
`docker compose up -d`

Generate an access token using `nak`:
```bash
curl http://localhost:5544/api/v1/nests/auth -H "Authorization: Nostr $(nak event -k 27235 -t method=GET -t u=http://localhost:5544/api/v1/nests/auth | base64)"
```

Connect to the livekit room: 
```
https://meet.livekit.io/custom?liveKitUrl=ws://localhost:7880&token=<token>
```