using LiveKit.Proto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nests.Database;
using NestsBackend.Model;
using NestsBackend.Services;
using Nostr.Client.Identifiers;
using Nostr.Client.Messages;
using Room = Nests.Database.Room;

namespace NestsBackend.Controllers;

[Route("/api/v1/nests")]
public class NestsController : Controller
{
    private readonly Config _config;
    private readonly NestsContext _db;
    private readonly LiveKitApi _liveKit;
    private readonly LiveKitJwt _liveKitJwt;

    public NestsController(Config config, NestsContext db, LiveKitApi liveKit, LiveKitJwt liveKitJwt)
    {
        _config = config;
        _db = db;
        _liveKit = liveKit;
        _liveKitJwt = liveKitJwt;
    }

    /// <summary>
    /// Create a new room
    /// </summary>
    /// <returns>Template nostr event with tags for streaming url and d-tag</returns>
    [HttpGet]
    [Authorize(AuthenticationSchemes = NostrAuth.Scheme)]
    public async Task<IActionResult> CreateNewRoom()
    {
        var pubkey = HttpContext.GetPubKey();
        if (string.IsNullOrEmpty(pubkey)) return Unauthorized();

        var room = new Room
        {
            CreatedBy = pubkey
        };

        var user = new Participant
        {
            Pubkey = pubkey,
            IsAdmin = true,
            IsSpeaker = true,
            Room = room,
            RoomId = room.Id
        };

        _db.Rooms.Add(room);
        _db.Participants.Add(user);
        await _db.SaveChangesAsync();

        var liveKitEgress = new RoomEgress()
        {
            Room = new RoomCompositeEgressRequest()
            {
                RoomName = room.Id.ToString(),
                SegmentOutputs =
                {
                    new SegmentedFileOutput
                    {
                        Protocol = SegmentedFileProtocol.HlsProtocol,
                        FilenamePrefix = $"{room.Id}/r",
                        PlaylistName = "live.m3u8",
                        S3 = new S3Upload
                        {
                            Endpoint = _config.EgressS3.Endpoint.ToString(),
                            Bucket = _config.EgressS3.Bucket,
                            AccessKey = _config.EgressS3.Key,
                            Secret = _config.EgressS3.Secret
                        }
                    }
                }
            }
        };

        var liveKitReq = new CreateRoomRequest
        {
            Name = room.Id.ToString(),
            //Egress = liveKitEgress
        };

        await _liveKit.CreateRoom(liveKitReq);
        var token = _liveKitJwt.CreateToken(pubkey, new LiveKitJwt.Permissions()
        {
            Room = room.Id.ToString(),
            RoomJoin = true,
            RoomAdmin = user.IsAdmin,
            CanSubscribe = true,
            CanPublish = user.IsSpeaker,
            CanPublishSources = ["microphone"]
        });

        return Json(new CreateRoomResponse
        {
            RoomId = room.Id,
            Endpoints =
            {
                new Uri(_config.EgressS3.Endpoint, $"{room.Id}/live.m3u8"),
                new Uri(
                    $"{(_config.PublicUrl.Scheme == "http" ? "ws" : "wss")}+livekit://{_config.PublicUrl.Host}:{_config.PublicUrl.Port}")
            },
            Token = token
        });
    }

    /// <summary>
    /// Join room as guest (no nostr key)
    /// </summary>
    /// <param name="id"></param>
    /// <returns></returns>
    [HttpGet("{id:guid}/guest")]
    [AllowAnonymous]
    public async Task<IActionResult> GuestJoinRoom([FromRoute] Guid id)
    {
        var room = await _db.Rooms
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        if (room == default)
        {
            return NotFound();
        }

        var guid = $"guest-{Guid.NewGuid()}";
        var token = _liveKitJwt.CreateToken(guid, new LiveKitJwt.Permissions()
        {
            Room = room.Id.ToString(),
            Hidden = true,
            RoomJoin = true,
            CanSubscribe = true,
            CanPublish = false
        });

        return Json(new { token });
    }

    /// <summary>
    /// Join room as nostr user
    /// </summary>
    /// <param name="id"></param>
    /// <returns></returns>
    [HttpGet("{id:guid}")]
    [Authorize(AuthenticationSchemes = NostrAuth.Scheme)]
    public async Task<IActionResult> JoinRoom([FromRoute] Guid id)
    {
        var pubkey = HttpContext.GetPubKey();
        if (string.IsNullOrEmpty(pubkey)) return Unauthorized();

        var room = await _db.Rooms
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        if (room == default)
        {
            return NotFound();
        }

        var participant = await _db.Participants
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.RoomId == room.Id && a.Pubkey == pubkey);

        if (participant == default)
        {
            participant = new Participant()
            {
                Pubkey = pubkey,
                RoomId = room.Id,
                IsAdmin = false,
                IsSpeaker = false
            };

            _db.Participants.Add(participant);
            await _db.SaveChangesAsync();
        }

        var token = _liveKitJwt.CreateToken(pubkey, new LiveKitJwt.Permissions()
        {
            Room = room.Id.ToString(),
            RoomJoin = true,
            RoomAdmin = participant.IsAdmin,
            CanSubscribe = true,
            CanPublish = participant.IsSpeaker,
            CanPublishSources = ["microphone"]
        });

        return Json(new { token });
    }

    /// <summary>
    /// Edit a users permissions
    /// </summary>
    /// <param name="id"></param>
    /// <param name="req"></param>
    /// <returns></returns>
    [HttpPost("{id:guid}/permissions")]
    [Authorize(AuthenticationSchemes = NostrAuth.Scheme)]
    public async Task<IActionResult> ChangePermissions([FromRoute] Guid id, [FromBody] ChangePermissionsRequest req)
    {
        var pubkey = HttpContext.GetPubKey();
        if (string.IsNullOrEmpty(pubkey)) return Unauthorized();

        var room = await _db.Rooms
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        if (room == default)
        {
            return NotFound();
        }

        var participant = await _db.Participants
            .FirstOrDefaultAsync(a => a.RoomId == room.Id && a.Pubkey == req.Participant);

        if (participant == default)
        {
            return BadRequest();
        }

        var callerParticipant = await _db.Participants
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.RoomId == room.Id && a.Pubkey == pubkey);

        if (callerParticipant == default)
        {
            return BadRequest();
        }

        if (!callerParticipant.IsAdmin)
        {
            return Unauthorized();
        }

        participant.IsSpeaker = req.CanPublish;
        await _db.SaveChangesAsync();

        await _liveKit.UpdateParticipant(new()
        {
            Room = room.Id.ToString(),
            Identity = participant.Pubkey,
            Permission = new()
            {
                CanPublish = req.CanPublish
            }
        });

        return Accepted();
    }

    [HttpGet("{id:guid}/info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetRoomInfo([FromRoute] Guid id)
    {
        var room = await _db.Rooms
            .AsNoTracking()
            .Include(a => a.Participants)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (room == default)
        {
            return NotFound();
        }

        return Json(new RoomInfoResponse
        {
            Host = room.CreatedBy,
            Speakers = room.Participants.Where(a => a.IsSpeaker).Select(a => a.Pubkey).ToList(),
            Admins = room.Participants.Where(a => a.IsAdmin).Select(a => a.Pubkey).ToList(),
            Link = new NostrAddressIdentifier(room.Id.ToString(), room.CreatedBy, null, (NostrKind)30312).ToBech32()
        });
    }
}