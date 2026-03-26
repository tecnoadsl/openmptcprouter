FROM debian:bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Dipendenze build OpenWrt
RUN apt-get update && apt-get install -y \
    build-essential clang flex bison g++ gawk gcc-multilib g++-multilib \
    gettext git libncurses-dev libssl-dev python3-distutils python3-setuptools \
    rsync swig unzip zlib1g-dev file wget curl xsltproc xmlto \
    python3 python3-dev python3-pip libelf-dev time bc \
    subversion mercurial ccache ecj fastjar java-propose-classpath \
    && rm -rf /var/lib/apt/lists/*

# Utente non-root per la build OpenWrt (requisito)
RUN useradd -m -s /bin/bash builder
USER builder
WORKDIR /home/builder

# Clone del fork
RUN git clone https://github.com/tecnoadsl/openmptcprouter.git /home/builder/openmptcprouter

COPY --chown=builder:builder build.py /home/builder/build.py
COPY --chown=builder:builder entrypoint.sh /home/builder/entrypoint.sh

USER root
RUN chmod +x /home/builder/entrypoint.sh
USER builder

EXPOSE 8085

CMD ["/home/builder/entrypoint.sh"]
