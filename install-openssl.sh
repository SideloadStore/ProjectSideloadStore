#!/bin/bash

# OpenSSL version to install
openssl_version="1.1.1"

# OpenSSL source URL
openssl_url="https://www.openssl.org/source/openssl-$openssl_version.tar.gz"

# OpenSSL source tarball name
openssl_tar="openssl-$openssl_version.tar.gz"

# Check if OpenSSL is already installed
if command -v openssl >/dev/null 2>&1; then
    installed_version=$(openssl version -v | awk '{print $2}')
    if [[ "$installed_version" == "$openssl_version" ]]; then
        echo "OpenSSL $openssl_version is already installed."
        exit 0
    else
        echo "Found OpenSSL $installed_version, but version $openssl_version is required."
        echo "Please uninstall the current version and run this script again."
    fi
fi

# Download OpenSSL source code
echo "Downloading OpenSSL $openssl_version..."
if command -v curl >/dev/null 2>&1; then
    curl -LO "$openssl_url"
elif command -v wget >/dev/null 2>&1; then
    wget "$openssl_url"
else
    echo "curl or wget not found. Please install either curl or wget and run this script again."
    exit 1
fi

# Extract OpenSSL source code
echo "Extracting $openssl_tar..."
tar -xf "$openssl_tar"

# Configure and install OpenSSL
cd "openssl-$openssl_version"

# Linux-specific configuration
./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl no-ssl2 no-ssl3 no-comp no-idea no-weak-ssl-ciphers

make depend
make -j$(nproc)
sudo make install_sw

# Configure the library search path
sudo ldconfig
export LD_LIBRARY_PATH="/usr/local/ssl/lib:$LD_LIBRARY_PATH"

# Cleanup
cd ..
rm -rf "openssl-$openssl_version" "$openssl_tar"

echo "OpenSSL $openssl_version has been successfully installed."
