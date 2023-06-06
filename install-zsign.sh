#!/bin/bash
zsign_url="https://github.com/zhlynn/zsign.git"

clone_zsign() {

    output=$(git clone "$zsign_url" zsign-dir 2>&1)
    lines=$(echo "$output" | wc -l)
    count=0

    while IFS= read -r line; do
        count=$((count + 1))
        percentage=$((count * 100 / lines))
        progress="["
        for ((i = 0; i < percentage; i += 2)); do
            progress+="="
        done
        progress+=">"

        echo -ne "Cloning progress: $progress $percentage% \r"
    done <<<"$output"

    echo "Cloning progress: [==================================================> 100%]"
}

platform=$(uname)

# Install required packages
install_packages() {
    if [[ "$platform" == "Darwin" ]]; then
        # macOS
        brew update
        brew install openssl@1.1

        # Add OpenSSL paths to environment variables
        export LDFLAGS="-L$(brew --prefix openssl@1.1)/lib"
        export CPPFLAGS="-I$(brew --prefix openssl@1.1)/include -I$(brew --prefix)/include"

        # Update pkg-config paths
        sudo cp $(brew --prefix openssl@1.1)/lib/pkgconfig/*.pc /usr/local/lib/pkgconfig/

    elif [[ "$platform" == "Linux" ]]; then

        # Configure OpenSSL library path
        export PKG_CONFIG_PATH=/usr/local/ssl/lib/pkgconfig:$PKG_CONFIG_PATH

        # Manual installation of OpenSSL
        openssl_version="1.1.1"
        openssl_url="https://www.openssl.org/source/openssl-$openssl_version.tar.gz"
        openssl_tar="openssl-$openssl_version.tar.gz"

        # Check if OpenSSL is already installed
        openssl_installed=false
        if command -v openssl >/dev/null 2>&1; then
            installed_version=$(openssl version -v | awk '{print $2}')
            if [[ "$installed_version" == "$openssl_version" ]]; then
                openssl_installed=true
                echo "OpenSSL $openssl_version is already installed."
            else
                echo "Found OpenSSL $installed_version, but version $openssl_version is required."
                echo "Proceeding with the installation of OpenSSL $openssl_version..."
            fi
        else
            echo "OpenSSL is not installed. Proceeding with the installation of OpenSSL $openssl_version..."
        fi

        # Download and install OpenSSL
        if [[ ! "$openssl_installed" ]]; then
            # Download OpenSSL source tarball
            echo "Downloading OpenSSL $openssl_version..."
            if command -v curl >/dev/null 2>&1; then
                curl -LO "$openssl_url"
            elif command -v wget >/dev/null 2>&1; then
                wget "$openssl_url"
            else
                echo "curl or wget not found. Please install either curl or wget and run this script again."
                exit 1
            fi

            # Extract OpenSSL source tarball
            echo "Extracting $openssl_tar..."
            tar -xf "$openssl_tar"

            # Configure and install OpenSSL
            echo "Configuring and installing OpenSSL $openssl_version..."
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
        fi

    else
        echo "Unsupported platform: $platform"
        exit 1
    fi
}


compile_zsign() {
    cd zsign-dir
    g++ *.cpp common/*.cpp -std=gnu++11 -lcrypto -I/usr/local/ssl/include -L/usr/local/ssl/lib -O3 -o zsign
    sudo mv zsign /usr/local/bin/zsign
    cd ..
    sudo rm -rf zsign-dir
    echo "Successfully built zsign"
}

main() {
    clone_zsign
    install_packages
    compile_zsign
    echo "Successfully installed and compiled Zsign"
}

main