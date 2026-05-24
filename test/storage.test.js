import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getWorkspaces, 
  saveWorkspaces, 
  getSettings, 
  saveSettings,
  getCalDAVCredentials,
  saveCalDAVCredentials,
  DEFAULT_WORKSPACE
} from '../src/utils/storage.js';

describe('storage.js', () => {
  beforeEach(() => {
    // Reset mock storage before each test
    global.__mockStorage = {};
  });

  describe('DEFAULT_WORKSPACE', () => {
    it('should have required properties', () => {
      expect(DEFAULT_WORKSPACE).toBeDefined();
      expect(DEFAULT_WORKSPACE.id).toBeDefined();
      expect(DEFAULT_WORKSPACE.name).toBe('Добро пожаловать');
      expect(DEFAULT_WORKSPACE.background).toBeDefined();
      expect(DEFAULT_WORKSPACE.background.type).toBe('color');
      expect(DEFAULT_WORKSPACE.widgets).toEqual([]);
    });
  });

  describe('getWorkspaces/saveWorkspaces', () => {
    it('should return default workspace when none saved', async () => {
      const workspaces = await getWorkspaces();
      
      expect(workspaces).toBeDefined();
      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('Добро пожаловать');
    });

    it('should save and retrieve workspaces', async () => {
      const testWorkspaces = [
        { id: '1', name: 'Workspace 1', widgets: [] },
        { id: '2', name: 'Workspace 2', widgets: [] }
      ];
      
      await saveWorkspaces(testWorkspaces);
      const retrieved = await getWorkspaces();
      
      expect(retrieved).toEqual(testWorkspaces);
    });

    it('should overwrite existing workspaces on save', async () => {
      const initialWorkspaces = [{ id: '1', name: 'Initial', widgets: [] }];
      await saveWorkspaces(initialWorkspaces);
      
      const newWorkspaces = [{ id: '2', name: 'New', widgets: [] }];
      await saveWorkspaces(newWorkspaces);
      
      const retrieved = await getWorkspaces();
      expect(retrieved).toEqual(newWorkspaces);
    });
  });

  describe('getSettings/saveSettings', () => {
    it('should return default settings when none saved', async () => {
      const settings = await getSettings();
      
      expect(settings).toBeDefined();
      expect(settings.theme).toBe('dark');
      expect(settings.masterPasswordHash).toBe('');
    });

    it('should save and retrieve settings', async () => {
      const testSettings = { theme: 'light', masterPasswordHash: 'abc123' };
      
      await saveSettings(testSettings);
      const retrieved = await getSettings();
      
      expect(retrieved).toEqual(testSettings);
    });

    it('should preserve theme when saving partial settings', async () => {
      await saveSettings({ theme: 'light', masterPasswordHash: 'hash1' });
      await saveSettings({ theme: 'dark' });
      
      const retrieved = await getSettings();
      expect(retrieved.theme).toBe('dark');
    });
  });

  describe('getCalDAVCredentials/saveCalDAVCredentials', () => {
    it('should return null when no credentials saved', async () => {
      const creds = await getCalDAVCredentials();
      expect(creds).toBeNull();
    });

    it('should save and retrieve CalDAV credentials', async () => {
      const testCreds = {
        url: 'https://caldav.example.com',
        username: 'user@example.com',
        password: 'secret'
      };
      
      await saveCalDAVCredentials(testCreds);
      const retrieved = await getCalDAVCredentials();
      
      expect(retrieved).toEqual(testCreds);
    });
  });
});
