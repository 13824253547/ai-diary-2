import { Injectable } from '@nestjs/common';

type AttestationResult = {
  keyId: string;
  publicKey: string;
  environment: string;
};

type AssertionResult = {
  signCount: number;
};

type AppAttestLibrary = {
  verifyAttestation(input: {
    attestation: Buffer;
    challenge: string;
    keyId: string;
    bundleIdentifier: string;
    teamIdentifier: string;
    allowDevelopmentEnvironment: boolean;
  }): AttestationResult;
  verifyAssertion(input: {
    assertion: Buffer;
    payload: string;
    publicKey: string;
    bundleIdentifier: string;
    teamIdentifier: string;
    signCount: number;
  }): AssertionResult;
};

const loadEsmModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<AppAttestLibrary>;

@Injectable()
export class AppAttestVerifier {
  private library?: Promise<AppAttestLibrary>;

  async verifyAttestation(input: Parameters<AppAttestLibrary['verifyAttestation']>[0]) {
    return (await this.getLibrary()).verifyAttestation(input);
  }

  async verifyAssertion(input: Parameters<AppAttestLibrary['verifyAssertion']>[0]) {
    return (await this.getLibrary()).verifyAssertion(input);
  }

  private getLibrary() {
    this.library ??= loadEsmModule('node-app-attest');
    return this.library;
  }
}
