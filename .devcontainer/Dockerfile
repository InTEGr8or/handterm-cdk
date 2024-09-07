FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:0-18

# Install AWS CLI
RUN apt-get update && apt-get install -y \
    unzip \
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Install CDK
RUN npm install -g aws-cdk

# Install additional tools                                                        
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \                     
    && apt-get -y install --no-install-recommends \                               
    jq \                                                                          
    git \
    fish \
    && apt-get clean \                                                            
    && rm -rf /var/lib/apt/lists/*   

# Set fish as the default shell for node user
RUN chsh -s /usr/bin/fish node

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh \
    && bash miniconda.sh -b -p /home/node/miniconda \
    && rm miniconda.sh

# Set up AWS CLI configuration                                                    
RUN mkdir -p /home/node/.aws                                                      
COPY config /home/node/.aws/config                                                
RUN chown -R node:node /home/node/.aws                                            
                                                                                   
# Set up Git configuration                                                        
COPY .gitconfig /home/node/.gitconfig                                             
RUN chown node:node /home/node/.gitconfig       

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh \
    && bash miniconda.sh -b -p /opt/conda \
    && rm miniconda.sh

# Add Miniconda to PATH
ENV PATH="/opt/conda/bin:${PATH}"

# Create aider-chat environment and install aider
RUN conda create -n aider-chat python=3.9 -y \
    && conda run -n aider-chat pip install aider-chat

# Set up fish configuration to activate conda environment
RUN echo 'if status is-interactive' >> /home/node/.config/fish/config.fish \
    && echo '    conda activate aider-chat' >> /home/node/.config/fish/config.fish \
    && echo 'end' >> /home/node/.config/fish/config.fish

# Set up bash configuration to activate conda environment
RUN echo 'eval "$(conda shell.bash hook)"' >> /home/node/.bashrc \
    && echo 'conda activate aider-chat' >> /home/node/.bashrc

# Create directory for Aider configuration
RUN mkdir -p /home/node/.config/aider
RUN chown -R node:node /home/node/.config/aider

# Add Aider to PATH
ENV PATH="/opt/conda/envs/aider-chat/bin:${PATH}"
