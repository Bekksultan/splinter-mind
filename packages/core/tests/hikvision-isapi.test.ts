/**
 * Hikvision ISAPI discovery parsing tests (Phase 2B).
 * Pure XML parsing — no network, no dependencies.
 */
import { describe, expect, it } from 'vitest';
import {
  parseDeviceInfoXml,
  parseVideoInputChannelsXml,
  xmlTagBlocks,
  xmlTagContent,
} from '../src/providers.ts';

const DEVICE_INFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<deviceName>NVR-Branch14</deviceName>
<deviceID>88</deviceID>
<model>DS-7616NI-K2</model>
<serialNumber>DS7616NIK22024AABBCC0012345678W</serialNumber>
<macAddress>bc:ad:28:11:22:33</macAddress>
<firmwareVersion>V4.61.025 build 240117</firmwareVersion>
<firmwareReleasedDate>build 240117</firmwareReleasedDate>
<deviceType>NVR</deviceType>
<telecontrolID>88</telecontrolID>
</DeviceInfo>`;

const CHANNELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<VideoInputChannelList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<VideoInputChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>101</id>
<inputPort>1</inputPort>
<name>Entrance</name>
<videoInputEnabled>true</videoInputEnabled>
</VideoInputChannel>
<VideoInputChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>102</id>
<inputPort>2</inputPort>
<name>Cashier &amp; Safe</name>
<videoInputEnabled>true</videoInputEnabled>
</VideoInputChannel>
<VideoInputChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>103</id>
<inputPort>3</inputPort>
<name></name>
<videoInputEnabled>false</videoInputEnabled>
</VideoInputChannel>
</VideoInputChannelList>`;

describe('xmlTagContent', () => {
  it('extracts inner text, tolerating attributes on the tag', () => {
    expect(xmlTagContent('<a foo="1">bar</a>', 'a')).toBe('bar');
  });
  it('returns null for a missing tag', () => {
    expect(xmlTagContent('<a>bar</a>', 'missing')).toBeNull();
  });
  it('decodes XML entities', () => {
    expect(xmlTagContent('<n>Cashier &amp; Safe</n>', 'n')).toBe('Cashier & Safe');
  });
});

describe('xmlTagBlocks', () => {
  it('returns one block per repeated element', () => {
    expect(xmlTagBlocks(CHANNELS_XML, 'VideoInputChannel')).toHaveLength(3);
  });
});

describe('parseDeviceInfoXml', () => {
  it('extracts device identity fields', () => {
    const info = parseDeviceInfoXml(DEVICE_INFO_XML);
    expect(info.deviceName).toBe('NVR-Branch14');
    expect(info.model).toBe('DS-7616NI-K2');
    expect(info.serialNumber).toBe('DS7616NIK22024AABBCC0012345678W');
    expect(info.firmwareVersion).toBe('V4.61.025 build 240117');
  });

  it('throws on an unrecognized payload', () => {
    expect(() => parseDeviceInfoXml('<html>nope</html>')).toThrow();
    expect(() => parseDeviceInfoXml('')).toThrow();
  });
});

describe('parseVideoInputChannelsXml', () => {
  it('parses id, name and enabled flag per channel', () => {
    const channels = parseVideoInputChannelsXml(CHANNELS_XML);
    expect(channels).toHaveLength(3);
    expect(channels[0]).toEqual({ id: '101', name: 'Entrance', enabled: true });
    // entities decoded in names
    expect(channels[1]).toEqual({ id: '102', name: 'Cashier & Safe', enabled: true });
    // disabled channel is still parsed (filtering is the caller's job)
    expect(channels[2]).toEqual({ id: '103', name: 'Camera 103', enabled: false });
  });

  it('falls back to "Camera <id>" for a missing name', () => {
    const xml = `<VideoInputChannelList><VideoInputChannel><id>201</id><videoInputEnabled>true</videoInputEnabled></VideoInputChannel></VideoInputChannelList>`;
    expect(parseVideoInputChannelsXml(xml)).toEqual([
      { id: '201', name: 'Camera 201', enabled: true },
    ]);
  });

  it('skips channel blocks without an id', () => {
    const xml = `<VideoInputChannelList><VideoInputChannel><name>Ghost</name></VideoInputChannel></VideoInputChannelList>`;
    expect(parseVideoInputChannelsXml(xml)).toEqual([]);
  });

  it('returns [] for an empty list', () => {
    expect(
      parseVideoInputChannelsXml('<VideoInputChannelList></VideoInputChannelList>'),
    ).toEqual([]);
  });
});
