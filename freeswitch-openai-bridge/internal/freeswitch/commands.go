package freeswitch

import (
	"fmt"
	"strings"
)

func (es *EventSocket) StartRecording(uuid, filename string) error {
	es.SendAPI(fmt.Sprintf("uuid_setvar %s record_read_only true", uuid))
	es.SendAPI(fmt.Sprintf("uuid_setvar %s record_stereo false", uuid))
	es.SendAPI(fmt.Sprintf("uuid_setvar %s enable_file_write_buffering false", uuid))
	es.SendAPI(fmt.Sprintf("uuid_setvar %s timer_name soft", uuid))
	_, err := es.SendAPI(fmt.Sprintf("uuid_record %s start %s 8000 1", uuid, filename))
	return err
}

func (es *EventSocket) StartWAVRecording(uuid, filename string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_record %s start %s", uuid, filename))
	return err
}

func (es *EventSocket) StopRecording(uuid, filename string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_record %s stop %s", uuid, filename))
	return err
}

func (es *EventSocket) PlayAudio(uuid, audioFile string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_broadcast %s %s", uuid, audioFile))
	return err
}

func (es *EventSocket) StopPlayback(uuid string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_break %s all", uuid))
	return err
}

func (es *EventSocket) EndCall(uuid string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_kill %s", uuid))
	return err
}

// Originate places an outbound call via FreeSWITCH.
// target may be a full SIP endpoint (contains "/") or a bare phone number.
// Bare phone numbers are wrapped with the legacy loopback prefix automatically.
// Returns the call UUID on success (parsed from "+OK <uuid>" response).
func (es *EventSocket) Originate(target, callerID, callBotId, scenario string) (string, error) {
	var endpoint string
	if strings.Contains(target, "/") {
		// Full SIP endpoint provided — use as-is
		endpoint = target
	} else {
		// Bare phone number — apply legacy loopback wrapping
		endpoint = fmt.Sprintf("loopback/%s/%s", target, es.config.Domain)
	}

	cmd := fmt.Sprintf(
		"originate {callbot_bridge=true,origination_caller_id_number=%s,ignore_early_media=true}%s &park",
		callerID,
		endpoint,
	)

	result, err := es.SendAPI(cmd)
	if err != nil {
		return "", fmt.Errorf("originate %s: %w", target, err)
	}

	// FreeSWITCH returns "+OK <uuid>" on success
	result = strings.TrimSpace(result)
	if strings.HasPrefix(result, "+OK") {
		parts := strings.Fields(result)
		if len(parts) >= 2 {
			return parts[1], nil
		}
		return "", nil
	}

	return "", fmt.Errorf("originate failed: %s", result)
}
