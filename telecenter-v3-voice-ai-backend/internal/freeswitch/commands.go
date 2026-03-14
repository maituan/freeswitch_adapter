package freeswitch

import (
	"fmt"
	"log"
	"strings"
)

func (es *EventSocket) Originate(phone, callerID, callBotId string) (string, error) {
	if callerID == "" {
		callerID = "Unknown"
	}

	cmd := fmt.Sprintf(
		"originate {origination_uuid=%s,origination_caller_id_number=%s,ignore_early_media=true}loopback/%s/%s &park",
		callBotId,
		callerID,
		phone,
		es.config.Domain,
	)

	resp, err := es.SendAPI(cmd)
	if err != nil {
		return "", err
	}
	log.Printf("resp call %s", resp)
	// Response format: "+OK <uuid>" or "-ERR <error>"
	resp = strings.TrimSpace(resp)

	if strings.HasPrefix(resp, "+OK") {
		parts := strings.Fields(resp)
		if len(parts) >= 2 {
			return parts[1], nil
		}
	}

	if strings.HasPrefix(resp, "-ERR") {
		return "", fmt.Errorf("originate failed: %s", resp)
	}

	return "", fmt.Errorf("unexpected response: %s", resp)
}

func (es *EventSocket) Answer(uuid string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_answer %s", uuid))
	return err
}

func (es *EventSocket) Hangup(uuid string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_kill %s", uuid))
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

func (es *EventSocket) StartRecording(uuid, filename string) error {
	es.SendAPI(fmt.Sprintf("uuid_setvar %s record_read_only true", uuid))
	es.SendAPI(fmt.Sprintf("uuid_setvar %s record_stereo false", uuid))

	es.SendAPI(fmt.Sprintf("uuid_setvar %s enable_file_write_buffering false", uuid))
	es.SendAPI(fmt.Sprintf("uuid_setvar %s timer_name soft", uuid))
	_, err := es.SendAPI(fmt.Sprintf("uuid_record %s start %s 8000 1", uuid, filename))
	return err
}

func (es *EventSocket) StopRecording(uuid, filename string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_record %s stop %s", uuid, filename))
	return err
}

func (es *EventSocket) SetVariable(uuid, varName, varValue string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_setvar %s %s %s", uuid, varName, varValue))
	return err
}

func (es *EventSocket) GetVariable(uuid, varName string) (string, error) {
	resp, err := es.SendAPI(fmt.Sprintf("uuid_getvar %s %s", uuid, varName))
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(resp), nil
}

func (es *EventSocket) Transfer(uuid, extension string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_transfer %s %s XML %s", uuid, extension, es.config.Domain))
	return err
}

func (es *EventSocket) EndCall(uuid string) error {
	_, err := es.SendAPI(fmt.Sprintf("uuid_kill %s", uuid))
	return err
}
