package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig     `yaml:"server"`
	FreeSWITCH FreeSWITCHConfig `yaml:"freeswitch"`
	Relay      RelayConfig      `yaml:"relay"`
	Audio      AudioConfig      `yaml:"audio"`
	Filler     FillerConfig     `yaml:"filler"`
}

type ServerConfig struct {
	Port int `yaml:"port"`
}

type FreeSWITCHConfig struct {
	Host     string `yaml:"host"`
	Password string `yaml:"password"`
	Domain   string `yaml:"domain"`
}

type RelayConfig struct {
	URL             string `yaml:"url"`
	APIKey          string `yaml:"api_key"`
	AudioSampleRate int    `yaml:"audio_sample_rate"`
	TTSVoicesURL    string `yaml:"tts_voices_url"`
}

type AudioConfig struct {
	RecordPath string `yaml:"record_path"`
	TTSPath    string `yaml:"tts_path"`
}

type FillerConfig struct {
	Enabled bool   `yaml:"enabled"`
	Path    string `yaml:"path"`
}

func Load() (*Config, error) {
	// Defaults
	cfg := Config{
		Server:     ServerConfig{Port: 8083},
		FreeSWITCH: FreeSWITCHConfig{Host: "127.0.0.1:8021", Password: "ClueCon"},
		Relay:      RelayConfig{URL: "ws://localhost:8091", AudioSampleRate: 8000},
		Audio:      AudioConfig{RecordPath: "/dev/shm/bridge/recordings", TTSPath: "/dev/shm/bridge/tts"},
		Filler:     FillerConfig{Path: "/opt/filler"},
	}

	// Optional YAML — override defaults if file exists
	_, filename, _, _ := runtime.Caller(0)
	configPath := filepath.Join(filepath.Dir(filename), "config.yaml")
	if data, err := os.ReadFile(configPath); err == nil {
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("parse config: %w", err)
		}
	} else {
		log.Printf("[Config] config.yaml not found, using defaults + env vars")
	}

	// Environment variables override everything
	if v := os.Getenv("FS_HOST"); v != "" {
		cfg.FreeSWITCH.Host = v
	}
	if v := os.Getenv("FS_PASSWORD"); v != "" {
		cfg.FreeSWITCH.Password = v
	}
	if v := os.Getenv("FS_DOMAIN"); v != "" {
		cfg.FreeSWITCH.Domain = v
	}
	if v := os.Getenv("RELAY_URL"); v != "" {
		cfg.Relay.URL = v
	}
	if v := os.Getenv("RELAY_API_KEY"); v != "" {
		cfg.Relay.APIKey = v
	}
	if v := os.Getenv("SERVER_PORT"); v != "" {
		fmt.Sscanf(v, "%d", &cfg.Server.Port)
	}
	if v := os.Getenv("TTS_VOICES_URL"); v != "" {
		cfg.Relay.TTSVoicesURL = v
	}
	if v := os.Getenv("FILLER_ENABLED"); v == "true" || v == "1" {
		cfg.Filler.Enabled = true
	}
	if v := os.Getenv("FILLER_PATH"); v != "" {
		cfg.Filler.Path = v
	}

	return &cfg, nil
}
