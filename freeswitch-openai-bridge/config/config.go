package config

import (
	"fmt"
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

func Load() (*Config, error) {
	_, filename, _, _ := runtime.Caller(0)
	configPath := filepath.Join(filepath.Dir(filename), "config.yaml")

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

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

	return &cfg, nil
}
