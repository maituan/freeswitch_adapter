package main

import (
    "bufio"
    "fmt"
    "log"
    "net"
    "strings"
    "time"

    "github.com/fiorix/go-eventsocket/eventsocket"
)

func main() {
    host := "127.0.0.1:8021"
    password := "ClueCon"
    
    log.Printf("Dialing %s...", host)
    conn, err := eventsocket.Dial(host, password)
    if err != nil {
        log.Printf("Dial error: %v", err)
        // Try to see if we can connect via raw TCP
        log.Printf("Attempting raw TCP connection...")
        testRawTCP(host, password)
        return
    }
    defer conn.Close()
    log.Printf("Connected successfully!")
    // Try to send a simple command
    ev, err := conn.Send("api status")
    if err != nil {
        log.Printf("Send error: %v", err)
        return
    }
    log.Printf("Response: %s", ev.Body)
}

func testRawTCP(host, password string) {
    log.Printf("Raw TCP dial to %s", host)
    c, err := net.DialTimeout("tcp", host, 5*time.Second)
    if err != nil {
        log.Printf("Raw TCP dial error: %v", err)
        return
    }
    defer c.Close()
    c.SetReadDeadline(time.Now().Add(5 * time.Second))
    
    // Read banner
    reader := bufio.NewReader(c)
    line, err := reader.ReadString('\n')
    if err != nil {
        log.Printf("Read banner error: %v", err)
        return
    }
    log.Printf("Banner: %s", strings.TrimSpace(line))
    
    // Send auth
    authCmd := fmt.Sprintf("auth %s\n\n", password)
    log.Printf("Sending auth: %s", authCmd)
    _, err = c.Write([]byte(authCmd))
    if err != nil {
        log.Printf("Write auth error: %v", err)
        return
    }
    
    // Read response
    resp, err := reader.ReadString('\n')
    if err != nil {
        log.Printf("Read auth response error: %v", err)
        return
    }
    log.Printf("Auth response: %s", strings.TrimSpace(resp))
    
    // If success, send api status
    if strings.HasPrefix(resp, "+OK") {
        cmd := "api status\n\n"
        _, err = c.Write([]byte(cmd))
        if err != nil {
            log.Printf("Write api status error: %v", err)
            return
        }
        // Read response lines until we see "\n\n"
        var output strings.Builder
        for {
            line, err := reader.ReadString('\n')
            if err != nil {
                log.Printf("Read api response error: %v", err)
                break
            }
            output.WriteString(line)
            if line == "\n" {
                break
            }
        }
        log.Printf("API status output: %s", output.String())
    }
}